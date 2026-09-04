// Approximate import duty rates by parts category (MFN) + Canadian GST/HST.
// USMCA: goods made in North America cross CA<->US duty-free.
const CATEGORY_DUTY = {
  'Brakes':         { us: 0.025, ca: 0.060 },
  'Oil & Fluids':   { us: 0.000, ca: 0.060 },
  'Filters':        { us: 0.025, ca: 0.065 },
  'Tires & Wheels': { us: 0.040, ca: 0.070 },
  'Ignition':       { us: 0.025, ca: 0.060 },
  'Suspension':     { us: 0.025, ca: 0.060 },
  'Electrical':     { us: 0.026, ca: 0.065 },
  'Wipers':         { us: 0.029, ca: 0.065 },
  'Exhaust':        { us: 0.025, ca: 0.060 },
  'Body Parts':     { us: 0.025, ca: 0.061 },
};
const CA_TAX = { AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, NT: 0.05, NU: 0.05, YT: 0.05 };

function isNorthAmerican(madeIn) {
  return /canada|united states|\busa\b|mexico|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick/i.test(madeIn || '');
}

function estimate({ category, madeIn, valueUsd, destination, province }) {
  const rates = CATEGORY_DUTY[category] || { us: 0.025, ca: 0.06 };
  const usmca = isNorthAmerican(madeIn);
  const lines = [];
  let duty = 0, tax = 0;

  if (destination === 'Canada') {
    duty = usmca ? 0 : valueUsd * rates.ca;
    lines.push({ label: usmca ? 'Import duty — USMCA (made in North America): 0%' : `Import duty — MFN rate (${(rates.ca * 100).toFixed(1)}%)`, amount: duty });
    const taxRate = CA_TAX[province] ?? 0.05;
    tax = (valueUsd + duty) * taxRate;
    lines.push({ label: `GST/HST (${(taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)`, amount: tax });
  } else {
    duty = usmca ? 0 : valueUsd * rates.us;
    lines.push({ label: usmca ? 'Import duty — USMCA (made in North America): 0%' : `Import duty — MFN rate (${(rates.us * 100).toFixed(1)}%)`, amount: duty });
    lines.push({ label: 'State sales tax', amount: null, note: 'varies by state — collected at checkout if applicable' });
  }
  return {
    lines, usmca,
    duty: +duty.toFixed(2), tax: +tax.toFixed(2),
    total: +(valueUsd + duty + tax).toFixed(2),
    disclaimer: 'Estimate only — final duty/tax is assessed by customs at import. Exact HS classification varies by part.',
  };
}

module.exports = { estimate };
