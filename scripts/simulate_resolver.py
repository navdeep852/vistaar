import json

with open('products_22_audit.json') as f:
    products = json.load(f)

with open('business_settings_dump.json') as f:
    bs = json.load(f)

branches = bs['bank_details']['_branches']
main_branch_id = "5c456a11-1321-40af-9c79-0fa151419922"

print(f"Loaded {len(products)} products and {len(branches)} branches.")

# Python implementation of resolveAuthoritativeStock matching productStockResolver.ts
def resolve_authoritative_stock(product_id, master_stock, target_branch_id, branches, branch_inventory, saved_main_branch_id):
    master = max(0, float(master_stock or 0))
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
        authoritative_main_id = saved_main_branch_id or (branches[0]['id'] if branches else None)

    # 3. Check for explicit record for THIS branch
    direct_record = None
    for bi in valid_allocations:
        if (bi.get('branchId') or bi.get('branch_id')) == target_branch_id:
            direct_record = bi
            break
    if direct_record:
        return max(0.0, float(direct_record.get('currentStock') or direct_record.get('current_stock') or 0))

    target_branch_obj = next((b for b in branches if b['id'] == target_branch_id), None)
    is_main = bool(
        (target_branch_obj and (target_branch_obj.get('isMainBranch') or target_branch_obj.get('branchCode') == 'MAIN')) or
        (target_branch_id and target_branch_id == authoritative_main_id) or
        len(branches) <= 1
    )

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

    if is_main:
        return max(0.0, master - secondary_sum)

    return max(0.0, master - secondary_sum)

print("\n--- TEST 1: Android with empty branchInventory ([]) ---")
android_stocks = []
for p in products:
    stock = resolve_authoritative_stock(
        product_id=p['id'],
        master_stock=p['current_stock'],
        target_branch_id=main_branch_id,
        branches=branches,
        branch_inventory=[],
        saved_main_branch_id=main_branch_id
    )
    android_stocks.append((p['name'], p['current_stock'], stock))

print("Phone Stand stock:", next(s for s in android_stocks if s[0] == 'Phone Stand'))
print("Wireless Mouse stock:", next(s for s in android_stocks if s[0] == 'Wireless Mouse'))
