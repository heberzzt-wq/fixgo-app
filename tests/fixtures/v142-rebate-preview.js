// Controlled V142 engineering-preview fixture. This function intentionally lacks
// a rebate ceiling check; the pilot may prepare a preview, but MUST NOT apply it.
export function applyRebate(amount,rebate){
  if(!Number.isFinite(amount)||!Number.isFinite(rebate)||amount<0||rebate<0)throw Error('INVALID_AMOUNT');
  return Number((amount-rebate).toFixed(2));
}
