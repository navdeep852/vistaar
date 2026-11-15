import json

with open('products_22_audit.json') as f:
    products = json.load(f)

with open('business_settings_dump.json') as f:
    bs = json.load(f)

branches = bs['bank_details']['_branches']
main_branch_id = "5c456a11-1321-40af-9c79-0fa151419922"

# Simulate local branch inventory where legacy products have 0 and Phone Stand has 95
simulated_branch_inventory = []
for p in products:
    if p['name'] == 'Phone Stand':
        simulated_branch_inventory.append({
            'branchId': main_branch_id,
            'productId': p['id'],
            'currentStock': 95.0
        })
    else:
        # Legacy products have dummy 0 record in local storage
        simulated_branch_inventory.append({
            'branchId': main_branch_id,
            'productId': p['id'],
            'currentStock': 0.0
        })

def resolve_fixed(product_id, master_stock, target_branch_id, branches, branch_inventory, saved_main_id):
    master = max(0.0, float(master_stock or 0))
    if master <= 0:
        return 0.0

    is_all = not target_branch_id or target_branch_id == 'ALL'
    known_branch_ids = set(b['id'] for b in branches)

    valid_allocations = [
        bi for bi in branch_inventory
        if (bi.get('branchId') or bi.get('branch_id')) and
           (bi.get('productId') or bi.get('product_id')) == product_id and
           (len(known_branch_ids) == 0 or (bi.get('branchId') or bi.get('branch_id')) in known_branch_ids)
    ]

    if is_all:
        if len(valid_allocations) > 0:
            s = sum(float(bi.get('currentStock') or bi.get('current_stock') or 0) for bi in valid_allocations)
            if s > 0: return max(0.0, s)
        return master

    authoritative_main_id = None
    for b in branches:
        if b.get('isMainBranch') or b.get('branchCode') == 'MAIN':
            authoritative_main_id = b['id']
            break
    if not authoritative_main_id:
        authoritative_main_id = saved_main_id or (branches[0]['id'] if branches else None)

    target_branch_obj = next((b for b in branches if b['id'] == target_branch_id), None)
    is_main = bool(
        (target_branch_obj and (target_branch_obj.get('isMainBranch') or target_branch_obj.get('branchCode') == 'MAIN')) or
        (target_branch_id and target_branch_id == authoritative_main_id) or
        len(branches) <= 1
    )

    direct_record = next((bi for bi in valid_allocations if (bi.get('branchId') or bi.get('branch_id')) == target_branch_id), None)
    direct_stock = max(0.0, float(direct_record.get('currentStock') or direct_record.get('current_stock') or 0)) if direct_record else 0.0

    secondary_allocations = [
        bi for bi in valid_allocations
        if (bi.get('branchId') or bi.get('branch_id')) != authoritative_main_id and
           not any(b['id'] == (bi.get('branchId') or bi.get('branch_id')) and b.get('isMainBranch') for b in branches)
    ]

    secondary_sum = sum(
        float(bi.get('currentStock') or bi.get('current_stock') or 0)
        for bi in secondary_allocations
        if (bi.get('branchId') or bi.get('branch_id')) != target_branch_id
    )

    authoritative_stock = max(0.0, master - secondary_sum)

    if is_main:
        # Main Branch: Master stock MINUS allocations to other valid secondary branches.
        # A stale or zeroed local cache entry must NEVER override valid non-zero master stock.
        return max(direct_stock, authoritative_stock)

    if direct_record:
        return direct_stock

    return authoritative_stock

print(f"{'#':<3} | {'Product Name':<25} | {'Master':<6} | {'Legacy Old':<10} | {'Fixed New':<10} | {'Status'}")
print("-" * 75)
total_master = 0
total_fixed = 0
for idx, p in enumerate(products):
    m = float(p.get('current_stock') or 0)
    # old logic:
    d_rec = next((bi for bi in simulated_branch_inventory if bi['productId'] == p['id']), None)
    old_res = float(d_rec['currentStock']) if d_rec else m

    fixed_res = resolve_fixed(
        p['id'],
        m,
        main_branch_id,
        branches,
        simulated_branch_inventory,
        main_branch_id
    )
    total_master += m
    total_fixed += fixed_res
    status = "OUT OF STOCK" if fixed_res == 0 else ("NEW (22nd)" if idx == 21 else "IN STOCK")
    print(f"{idx+1:<3} | {p['name']:<25} | {m:<6.1f} | {old_res:<10.1f} | {fixed_res:<10.1f} | {status}")

print("-" * 75)
print(f"Total Master Stock: {total_master:.1f} Units | Total Fixed Stock: {total_fixed:.1f} Units")
