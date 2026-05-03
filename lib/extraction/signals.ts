// Active signal taxonomy — mirrors the seeded data in supabase/schema.sql
// Used by extraction prompts so Claude knows the exact signal vocabulary

export const SIGNAL_TAXONOMY = {
  'Profitability': [
    'EBITDA margin compression',
    'Wage inflation impact',
    'Subcontracting cost escalation',
    'Offshore mix shift',
  ],
  'Revenue & Growth': [
    'Revenue miss vs. guidance',
    'Vertical softness - BFSI',
    'Vertical softness - hi-tech',
    'Geographic mix',
    'Pricing pressure',
  ],
  'Deal Pipeline': [
    'Deal ramp slowdown',
    'TCV-to-revenue conversion lag',
    'Large deal dependency',
    'Deal win rate',
  ],
  'Headcount': [
    'Bench utilisation spike',
    'Attrition normalisation',
    'Fresher absorption',
    'Pyramid restructuring',
  ],
  'Guidance': [
    'Guidance credibility',
    'Commentary vagueness',
    'FY outlook revision',
    'Conservative vs. bullish framing',
  ],
  'Capital Allocation': [
    'Cash conversion cycle',
    'Dividend policy',
    'Acquisition rationale',
    'Buyback timing',
  ],
  'Technology': [
    'GenAI revenue contribution',
    'IP-led vs. services mix',
    'Platform deal wins',
    'AI headcount investment',
  ],
  'Macro & Sector': [
    'US client budget freeze',
    'BFSI recovery timeline',
    'Visa cost pressures',
    'Furlough impact',
  ],
}

export const ALL_SIGNALS = Object.values(SIGNAL_TAXONOMY).flat()

export const SIGNAL_TAXONOMY_TEXT = Object.entries(SIGNAL_TAXONOMY)
  .map(([topic, signals]) => `${topic}: ${signals.join(', ')}`)
  .join('\n')
