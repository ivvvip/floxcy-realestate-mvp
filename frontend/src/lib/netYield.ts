// NET yield — gross is advertised, net is what actually hits your account.
// Net = gross − service-charge drag − vacancy drag.
//
// Key identity: service-charge drag as a % of price = rate(AED/sqft) ÷ ppsf,
// because price = ppsf × sqft, so (rate × sqft) / (ppsf × sqft) = rate / ppsf.
// Size cancels — the drag depends only on the AED/sqft rate and the area ppsf.
//
// Service-charge defaults are ESTIMATES classified from DLD-published ranges;
// users adjust them. Always label "verify via DLD Service Charge Index / Mollak".

export const VACANCY_DEFAULT_PCT = 5;
export const SERVICE_RATE_DEFAULT = 18;

/** Estimated AED/sqft/yr service charge from area avg ppsf (+ villa override). */
export function serviceRateFor(ppsf: number | null | undefined, isVilla = false): number {
  if (isVilla) return 5;
  if (ppsf == null || !Number.isFinite(ppsf)) return SERVICE_RATE_DEFAULT;
  if (ppsf < 1200) return 14;
  if (ppsf <= 2000) return 18;
  return 28;
}

export interface NetYieldBreakdown {
  gross: number;
  serviceDragPct: number;
  vacancyDragPct: number;
  net: number;
  serviceRate: number;
}

export function computeNetYield(
  grossPct: number | null | undefined,
  ppsf: number | null | undefined,
  serviceRate: number,
  vacancyPct: number = VACANCY_DEFAULT_PCT,
): NetYieldBreakdown | null {
  if (grossPct == null || !Number.isFinite(grossPct) || grossPct <= 0) return null;
  const serviceDragPct = ppsf && ppsf > 0 ? (serviceRate / ppsf) * 100 : 0;
  const vacancyDragPct = grossPct * (vacancyPct / 100);
  const net = Math.max(0, grossPct - serviceDragPct - vacancyDragPct);
  return { gross: grossPct, serviceDragPct, vacancyDragPct, net, serviceRate };
}

export interface CashOnCash {
  downPayment: number;
  annualMortgage: number;       // principal + interest, annual
  netAnnualIncome: number;      // rent − service − vacancy
  afterDebtIncome: number;      // net income − mortgage
  cashOnCashPct: number | null; // afterDebtIncome ÷ (downPayment + closing)
}

/** Levered return: net rental income minus annual mortgage, over cash invested. */
export function cashOnCash(opts: {
  price: number;
  annualRent: number;
  serviceAnnual: number;
  vacancyPct: number;
  ltvPct: number;        // loan-to-value, e.g. 75
  ratePct: number;       // annual interest rate
  termYears: number;
  closingPct?: number;   // upfront fees, default 7%
}): CashOnCash | null {
  const { price, annualRent, serviceAnnual, vacancyPct, ltvPct, ratePct, termYears } = opts;
  if (!price || price <= 0) return null;
  const closingPct = opts.closingPct ?? 7;
  const loan = price * (ltvPct / 100);
  const downPayment = price - loan;
  const r = ratePct / 100 / 12;
  const nMonths = termYears * 12;
  const monthly = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -nMonths)) : loan / nMonths;
  const annualMortgage = monthly * 12;
  const netAnnualIncome = annualRent * (1 - vacancyPct / 100) - serviceAnnual;
  const afterDebtIncome = netAnnualIncome - annualMortgage;
  const cashInvested = downPayment + price * (closingPct / 100);
  return {
    downPayment,
    annualMortgage,
    netAnnualIncome,
    afterDebtIncome,
    cashOnCashPct: cashInvested > 0 ? (afterDebtIncome / cashInvested) * 100 : null,
  };
}
