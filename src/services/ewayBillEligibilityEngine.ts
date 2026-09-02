import { EwayBill, EwayBillEligibilityResult, VehicleType } from '../types';

/**
 * Indian GSTIN Regex Pattern (15 Alphanumeric characters)
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Indian PIN Code Regex Pattern (6 Digits)
 */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Indian Vehicle Number Regex Pattern
 * (e.g. UP32AB1234, DL01C1234, MH-12-PQ-9999)
 */
export const VEHICLE_NUMBER_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/i;

export const STANDARD_EWAY_BILL_THRESHOLD = 50000;

export class EwayBillEligibilityEngine {
  /**
   * Validates whether a GSTIN matches official 15-character format
   */
  public static isValidGstin(gstin?: string): boolean {
    if (!gstin) return false;
    const clean = gstin.trim().toUpperCase();
    return GSTIN_REGEX.test(clean);
  }

  /**
   * Validates whether a 6-digit Indian PIN Code is valid
   */
  public static isValidPincode(pincode?: string): boolean {
    if (!pincode) return false;
    const clean = pincode.trim();
    return PINCODE_REGEX.test(clean);
  }

  /**
   * Sanitizes and validates Indian Vehicle Registration Numbers
   */
  public static isValidVehicleNumber(vehicleNumber?: string): boolean {
    if (!vehicleNumber) return false;
    const clean = vehicleNumber.replace(/[\s-]/g, '').toUpperCase();
    return VEHICLE_NUMBER_REGEX.test(clean);
  }

  /**
   * Estimates approximate distance in kilometers between two PIN codes
   */
  public static estimateDistanceKm(fromPincode: string, toPincode: string): number {
    const from = parseInt(fromPincode.trim(), 10);
    const to = parseInt(toPincode.trim(), 10);

    if (isNaN(from) || isNaN(to)) return 100;
    if (from === to) return 15;

    // Approximate PIN code regional distance calculation
    const diff = Math.abs(from - to);
    const baseKm = Math.min(Math.max(Math.round(diff / 100), 20), 2500);
    return baseKm;
  }

  /**
   * Calculates legal E-Way Bill validity in hours based on distance and vehicle type.
   * GST Rules:
   * - Regular Cargo: 1 day (24 hrs) for up to 200 km, and 1 additional day for every 200 km or part thereof.
   * - Over Dimensional Cargo (ODC): 1 day (24 hrs) for up to 20 km, and 1 additional day for every 20 km or part thereof.
   */
  public static calculateValidityHours(distanceKm: number, vehicleType: VehicleType = 'REGULAR'): number {
    const dist = Math.max(distanceKm, 1);
    if (vehicleType === 'OVER_DIMENSIONAL_CARGO') {
      const days = Math.ceil(dist / 20);
      return days * 24;
    } else {
      const days = Math.ceil(dist / 200);
      return days * 24;
    }
  }

  /**
   * Evaluates transaction data against Indian GST compliance rules
   * to determine if an E-Way Bill is required or if blocking errors exist.
   */
  public static checkEligibility(payload: Partial<EwayBill>): EwayBillEligibilityResult {
    const warnings: string[] = [];
    const blockingErrors: string[] = [];

    const totalValue = Number(payload.totalInvoiceValue || payload.totalTaxableValue || 0);
    const isInterstate =
      Boolean(payload.fromState && payload.toState) &&
      payload.fromState?.trim().toLowerCase() !== payload.toState?.trim().toLowerCase();

    // 1. Threshold Check
    let required = totalValue >= STANDARD_EWAY_BILL_THRESHOLD;

    if (totalValue < STANDARD_EWAY_BILL_THRESHOLD) {
      if (isInterstate) {
        warnings.push(
          `Consignment value (₹${totalValue.toLocaleString('en-IN')}) is below standard ₹50,000 threshold, but movement is Interstate (${payload.fromState} → ${payload.toState}). E-Way Bill is optional or recommended.`
        );
      } else {
        warnings.push(
          `Consignment value (₹${totalValue.toLocaleString('en-IN')}) is below standard ₹50,000 threshold.`
        );
      }
    } else {
      required = true;
    }

    // 2. Origin & Dispatch Validation
    if (!payload.fromTradeName || !payload.fromTradeName.trim()) {
      blockingErrors.push('Dispatch From / Origin Trade Name is required.');
    }
    if (!payload.fromAddress || !payload.fromAddress.trim()) {
      blockingErrors.push('Dispatch From / Origin Address is required.');
    }
    if (!payload.fromState || !payload.fromState.trim()) {
      blockingErrors.push('Dispatch From / Origin State is required.');
    }
    if (!this.isValidPincode(payload.fromPincode)) {
      blockingErrors.push('Dispatch From PIN Code must be a valid 6-digit Indian PIN Code.');
    }

    // 3. Destination Validation
    if (!payload.toTradeName || !payload.toTradeName.trim()) {
      blockingErrors.push('Destination / Delivery Trade Name is required.');
    }
    if (!payload.toAddress || !payload.toAddress.trim()) {
      blockingErrors.push('Destination / Delivery Address is required.');
    }
    if (!payload.toState || !payload.toState.trim()) {
      blockingErrors.push('Destination / Delivery State is required.');
    }
    if (!this.isValidPincode(payload.toPincode)) {
      blockingErrors.push('Destination PIN Code must be a valid 6-digit Indian PIN Code.');
    }

    // 4. GSTIN Validations (where present)
    if (payload.fromGstin && !this.isValidGstin(payload.fromGstin)) {
      warnings.push(`Dispatch GSTIN "${payload.fromGstin}" does not match standard 15-character GSTIN format.`);
    }
    if (payload.toGstin && !this.isValidGstin(payload.toGstin)) {
      warnings.push(`Recipient GSTIN "${payload.toGstin}" does not match standard 15-character GSTIN format.`);
    }

    // 5. Goods / HSN Validation
    if (!payload.items || payload.items.length === 0) {
      blockingErrors.push('At least one Goods line item with HSN code is required.');
    } else {
      payload.items.forEach((item, index) => {
        if (!item.hsnCode || !item.hsnCode.trim()) {
          blockingErrors.push(`Item #${index + 1} ("${item.productName || 'Product'}") is missing HSN Code.`);
        }
        if (Number(item.quantity) <= 0) {
          blockingErrors.push(`Item #${index + 1} ("${item.productName || 'Product'}") must have a quantity > 0.`);
        }
      });
    }

    // 6. Transportation Mode Validation
    if (payload.transportMode === 'ROAD') {
      if (!payload.vehicleNumber && !payload.transporterGstin && !payload.transporterId) {
        warnings.push('For Road Transport, enter either Vehicle Number or Transporter ID before generating.');
      }
    } else {
      if (!payload.transportDocumentNumber) {
        blockingErrors.push(`Transport Document Number (LR/RR/Airway Bill No) is required for ${payload.transportMode} mode.`);
      }
    }

    // Calculate approximate distance
    const distKm =
      Number(payload.approxDistanceKm) > 0
        ? Number(payload.approxDistanceKm)
        : this.estimateDistanceKm(payload.fromPincode || '', payload.toPincode || '');

    const validityHours = this.calculateValidityHours(distKm, payload.vehicleType || 'REGULAR');

    return {
      required,
      reason: required
        ? 'E-Way Bill is required for this consignment.'
        : 'E-Way Bill is optional based on consignment value.',
      warnings,
      blockingErrors,
      approxDistanceKm: distKm,
      suggestedValidityHours: validityHours,
    };
  }
}
