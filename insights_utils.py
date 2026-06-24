import os
from groq import Groq
import google.generativeai as genai

def call_ai(prompt: str) -> dict:
    groq_key = os.environ.get('GROQ_API_KEY')
    if groq_key:
        try:
            client   = Groq(api_key=groq_key)
            response = client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=[{'role': 'user', 'content': prompt}],
                max_tokens=400,
                temperature=0.2,
            )
            return {
                'text':  response.choices[0].message.content.strip(),
                'model': 'Llama 3.3 · Groq',
                'error': None,
            }
        except Exception:
            pass

    gemini_key = os.environ.get('GEMINI_API_KEY')
    if gemini_key:
        try:
            genai.configure(api_key=gemini_key)
            model    = genai.GenerativeModel('gemini-2.0-flash-exp')
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=400,
                    temperature=0.2,
                )
            )
            return {
                'text':  response.text.strip(),
                'model': 'Gemini 2.0 Flash',
                'error': None,
            }
        except Exception as e:
            return {'text': '', 'model': 'none', 'error': str(e)}

    return {'text': '', 'model': 'none',
            'error': 'No API keys configured'}

def parse_response(text: str) -> dict:
    result = {
        'what_happened':      '',
        'why_it_matters':     '',
        'hidden_insight':     '',
        'action':             '',
        'opportunity_outlook': '',
        'summary_table':       [],
    }
    markers = {
        'WHAT:':        'what_happened',
        'WHY:':         'why_it_matters',
        'HIDDEN:':      'hidden_insight',
        'ACTION:':      'action',
        'OUTLOOK:':     'opportunity_outlook',
    }
    current = None
    table_mode = False
    for line in text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.upper().startswith('SUMMARY TABLE:'):
            table_mode = True
            current = None
            continue
        if table_mode:
            content = line
            # strip number prefix like "1. " or "2. "
            if content[0].isdigit() and len(content) > 2 and (content[1] == '.' or content[2] == '.'):
                content = content.split('.', 1)[1].strip()
            parts = [p.strip() for p in content.split('|')]
            if len(parts) >= 2:
                obs = parts[0]
                met = parts[1]
                imp = parts[2] if len(parts) > 2 else 'General'
                result['summary_table'].append({
                    'observation': obs,
                    'metric': met,
                    'impact': imp
                })
            continue

        matched = False
        for marker, key in markers.items():
            if line.upper().startswith(marker):
                current = key
                content = line[len(marker):].strip()
                if content:
                    result[key] = content
                matched = True
                break
        if not matched and current:
            sep = ' ' if result[current] else ''
            result[current] += sep + line

    # Fallback: if parsing failed entirely, put raw text in
    # what_happened so something is always displayed
    if not any(v for k, v in result.items() if k != 'summary_table'):
        result['what_happened'] = text.strip()

    return result

OUTPUT_FORMAT = """
Respond using EXACTLY this format — five labelled lines followed by a SUMMARY TABLE header and exactly five table rows separated by '|', nothing else:

WHAT: [One sentence. Name at least 2 specific search terms. Include at least 2 specific numbers from the data above.]
WHY: [One sentence. Diagnose the root cause — is this a search relevance problem, a catalog gap, a pricing signal, or a seasonality effect? Name the specific term it applies to.]
HIDDEN: [One to two sentences. Connect two or more signals from the data to surface something that is not directly visible as a single metric. Start with "What the data implies:"]
ACTION: [One sentence. Name one specific search term or category. State exactly what to change, check, or investigate — not a generic recommendation.]
OUTLOOK: [One sentence. Forecast future demand growth, identify a seasonal trend or opportunity, or name an untapped product category/term from the data.]

SUMMARY TABLE:
1. [Concise observation point, under 10 words] | [Supporting key metric/signal] | [Impact area/focus]
2. [Concise observation point, under 10 words] | [Supporting key metric/signal] | [Impact area/focus]
3. [Concise observation point, under 10 words] | [Supporting key metric/signal] | [Impact area/focus]
4. [Concise observation point, under 10 words] | [Supporting key metric/signal] | [Impact area/focus]
5. [Concise observation point, under 10 words] | [Supporting key metric/signal] | [Impact area/focus]

Rules you must follow:
- Every sentence and observation must reference specific data from the table above
- Keep each observation in the SUMMARY TABLE concise and focused like a pointer
- Do not repeat the same term in WHAT and ACTION — the action should address a different term than the headline
- If a metric is missing or null, say "data unavailable for X" rather than guessing
"""

def fmt_terms_table(terms: list, avg: dict) -> str:
    if not terms:
        return "No term data available."

    avg_v = avg.get('visit_rate_pct', 0)
    avg_a = avg.get('a2c_rate_pct', 0)
    avg_p = avg.get('purchase_rate_pct', 0)

    def health(v, a, p):
        flags = []
        if avg_v and v < avg_v * 0.5:  flags.append('VISIT BROKEN')
        elif avg_v and v < avg_v:       flags.append('visit low')
        if avg_a and a < avg_a * 0.5:  flags.append('A2C BROKEN')
        elif avg_a and a < avg_a:       flags.append('a2c low')
        if avg_p and p < avg_p * 0.5:  flags.append('PURCH BROKEN')
        if not flags:                   flags.append('healthy')
        return ', '.join(flags)

    header = (
        f"{'TERM':<28} {'SEARCHES':>9} {'MoM%':>7} "
        f"{'VISIT%':>8} {'A2C%':>6} {'PURCH%':>8}  STATUS\n"
    )
    divider = '-' * 85 + '\n'
    rows = ''
    for i, t in enumerate(terms[:10], 1):
        v = t.get('visit_rate_pct', 0) or 0
        a = t.get('a2c_rate_pct',   0) or 0
        p = t.get('purchase_rate_pct', 0) or 0
        m = t.get('mom_pct')
        mom_str = f"{m:+.1f}%" if m is not None else "n/a"
        rows += (
            f"{i:<3}{t.get('term',''):<25} "
            f"{int(t.get('searches',0)):>9,} "
            f"{mom_str:>7} "
            f"{v:>7.1f}% "
            f"{a:>5.1f}% "
            f"{p:>7.1f}%  "
            f"{health(v,a,p)}\n"
        )

    benchmark = (
        f"\nSITE BENCHMARK: "
        f"Visit {avg_v:.1f}% | A2C {avg_a:.1f}% | "
        f"Purchase {avg_p:.1f}%\n"
        f"BROKEN = below 50% of benchmark | "
        f"low = below benchmark | healthy = at or above\n"
    )
    return header + divider + rows + benchmark

def prompt_weekly_brief(s: dict) -> str:
    terms_table = fmt_terms_table(
        s.get('top_10_terms', []),
        s.get('site_avg', {})
    )
    return f"""You are a senior product analyst at Tanishq, India's
leading jewellery brand. You are reviewing weekly search analytics.
Be specific. Be data-driven. No generic advice.

WEEKLY SNAPSHOT:
- Total searches: {s.get('total_searches', 0):,}
- Total orders from search: {s.get('total_orders', 0):,}
- E2E conversion: {s.get('e2e_conv')}%
- Zero-conversion high-traffic terms: {s.get('zero_conv_count', 0)}
- Long-tail terms with zero add-to-cart: {s.get('zero_cart_count', 0)}
- Top occasion driving demand: {s.get('top_occasion')} \
({s.get('top_occasion_searches', 0):,} searches, \
{s.get('top_occasion_conv')}% conversion)

TOP 10 SEARCH TERMS:
{terms_table}

{OUTPUT_FORMAT}"""

def prompt_demand(s: dict) -> str:
    terms_table = fmt_terms_table(
        s.get('top_10_terms', []),
        s.get('site_avg', {})
    )
    growers   = s.get('top_growers', [])
    decliners = s.get('top_decliners', [])

    def fmt_movers(items):
        if not items: return "none"
        return '; '.join(
            f"{t['term']} ({t.get('mom_pct',0):+.1f}%, "
            f"visit {t.get('visit_rate_pct',0):.1f}%, "
            f"a2c {t.get('a2c_rate_pct',0):.1f}%)"
            for t in items[:3]
        )

    return f"""You are a senior product analyst at Tanishq.
Analyse this search demand data. Be specific. No generic advice.

TOP 10 TERMS WITH FULL FUNNEL METRICS:
{terms_table}

TOP GROWING TERMS (MoM): {fmt_movers(growers)}
TOP DECLINING TERMS (MoM): {fmt_movers(decliners)}

BROKEN FUNNEL GROWERS (growing but visit rate below half of \
site average — demand rising into broken search):
{s.get('broken_funnel_summary', 'none')}

LONG-TAIL SHARE OF SEARCHES: {s.get('long_tail_pct')}%
INTENT CLUSTER LEADING DEMAND: {s.get('top_occasion')} \
({s.get('top_occasion_searches', 0):,} searches)

{OUTPUT_FORMAT}"""

def prompt_catalog_gaps(s: dict) -> str:
    def fmt_gap_terms(items, label):
        if not items: return f"{label}: none"
        lines = f"{label}:\n"
        for t in items[:7]:
            v = t.get('visit_rate_pct', 0) or 0
            diagnosis = (
                'CATALOG GAP (users visiting but not adding)' if v >= 30
                else 'RELEVANCE GAP (users not clicking results)'
            )
            lines += (
                f"  - {t['term']}: {int(t.get('searches',0)):,} searches, "
                f"{v:.1f}% visit rate → {diagnosis}\n"
            )
        return lines

    zero_cart = fmt_gap_terms(
        s.get('zero_cart_terms', []),
        'LONG-TAIL ZERO-CART TERMS (specific intent, nothing bought)'
    )
    zero_conv = fmt_gap_terms(
        s.get('zero_conv_terms', []),
        'HIGH-TRAFFIC ZERO-CONVERSION TERMS'
    )

    return f"""You are a senior product analyst at Tanishq.
Identify catalog and search relevance gaps from this data.

SITE AVERAGE VISIT RATE: {s.get('avg_visit_rate')}%
DIAGNOSIS KEY: visit rate ≥30% + zero A2C = catalog gap \
(product missing or wrong). visit rate <30% + zero A2C = \
relevance gap (search not surfacing right results).

{zero_cart}

{zero_conv}

TOTAL ZERO-CART LONG-TAIL TERMS: {s.get('zero_cart_count', 0)}
TOTAL ZERO-CONV HIGH-TRAFFIC TERMS: {s.get('zero_conv_count', 0)}

{OUTPUT_FORMAT}"""

def prompt_funnel(s: dict) -> str:
    stages = s.get('stage_breakdown', {})
    cats   = s.get('category_funnel', [])
    cat_table = ''
    if cats:
        cat_table = "\nCATEGORY FUNNEL COMPARISON:\n"
        cat_table += (
            f"{'CATEGORY':<22} {'SEARCHES':>9} "
            f"{'VISIT%':>8} {'A2C%':>6} {'PURCH%':>8}\n"
        )
        cat_table += '-' * 60 + '\n'
        for c in cats[:8]:
            cat_table += (
                f"{c.get('category',''):<22} "
                f"{int(c.get('searches',0)):>9,} "
                f"{c.get('visit_rate_pct',0):>7.1f}% "
                f"{c.get('a2c_rate_pct',0):>5.1f}% "
                f"{c.get('purchase_rate_pct',0):>7.1f}%\n"
            )

    degraders = s.get('top_degraders', [])
    deg_str   = '; '.join(
        f"{d['term']} (visit rate {d.get('delta_pct',0):+.1f}pp WoW)"
        for d in degraders[:3]
    ) if degraders else 'none'

    a2c_no_orders = s.get('a2c_no_orders_terms', [])
    checkout_str  = ', '.join(
        f"{t['term']} ({int(t.get('a2c_count',0))} A2Cs, 0 orders)"
        for t in a2c_no_orders[:3]
    ) if a2c_no_orders else 'none'

    return f"""You are a senior product analyst at Tanishq.
Diagnose the search funnel using this data.

SITE-LEVEL FUNNEL THIS WEEK:
  Search → Visit:   {s.get('overall_visit_rate')}% \
(benchmark: previous week or industry context)
  Visit → A2C:      {s.get('overall_a2c_rate')}%
  A2C → Purchase:   {s.get('overall_purchase_rate')}%
  Search → Order:   {s.get('overall_e2e')}%

FUNNEL STAGE BREAKDOWN (how many terms at each stage):
  Stage 1 — No visits at all:     {stages.get('stage1', 0)} terms
  Stage 2 — Visits, no A2C:       {stages.get('stage2', 0)} terms
  Stage 3 — A2C, no orders:       {stages.get('stage3', 0)} terms
  Healthy — Full funnel working:  {stages.get('healthy', 0)} terms

BIGGEST VISIT RATE DEGRADERS THIS WEEK (WoW drop):
{deg_str}

CHECKOUT FRICTION SIGNAL (terms with A2C but zero orders — \
possible OOS or checkout bug):
{checkout_str}
{cat_table}
{OUTPUT_FORMAT}"""

def prompt_categories(s: dict) -> str:
    cats = s.get('category_data', [])
    table = ''
    if cats:
        table = (
            f"{'CATEGORY':<22} {'SEARCHES':>9} {'MoM%':>7} "
            f"{'VISIT%':>8} {'A2C%':>6} {'E2E%':>7}  STATUS\n"
        )
        table += '-' * 75 + '\n'
        avg_e2e = s.get('site_avg_e2e', 0) or 0
        for c in cats:
            e2e = c.get('e2e_pct', 0) or 0
            m   = c.get('mom_pct')
            status = (
                'HIGH TRAFFIC LOW CONV' if c.get('searches',0) > 2000
                and e2e < avg_e2e * 0.5
                else 'OPPORTUNITY' if (m or 0) > 20 and e2e >= avg_e2e
                else ''
            )
            mom_str = f"{m:+.1f}%" if m is not None else "n/a"
            table += (
                f"{c.get('category',''):<22} "
                f"{int(c.get('searches',0)):>9,} "
                f"{mom_str:>7} "
                f"{c.get('visit_rate_pct',0):>7.1f}% "
                f"{c.get('a2c_rate_pct',0):>5.1f}% "
                f"{e2e:>6.2f}%  "
                f"{status}\n"
            )

    return f"""You are a senior product analyst at Tanishq.
Identify category-level patterns in this search data.

SITE AVERAGE E2E CONVERSION: {s.get('site_avg_e2e')}%

CATEGORY PERFORMANCE TABLE:
{table}
TOP BREAKOUT TERM THIS WEEK: {s.get('breakout_term')} \
({s.get('breakout_searches', 0):,} searches)
CATEGORY WITH BEST CONVERSION: {s.get('best_conv_cat')} \
({s.get('best_conv_rate')}% E2E)
CATEGORY WITH WORST CONVERSION DESPITE HIGH TRAFFIC: \
{s.get('worst_conv_cat')} \
({s.get('worst_conv_rate')}% E2E, \
{s.get('worst_conv_searches', 0):,} searches)

{OUTPUT_FORMAT}"""

PROMPT_BUILDERS = {
    'weekly_brief': prompt_weekly_brief,
    'demand':       prompt_demand,
    'catalog_gaps': prompt_catalog_gaps,
    'funnel':       prompt_funnel,
    'categories':   prompt_categories,
}

def generate_insight(section: str, summary: dict) -> dict:
    builder = PROMPT_BUILDERS.get(section)
    if not builder:
        return {
            'sections': {},
            'model':    'none',
            'error':    f'Unknown section: {section}',
        }
    prompt   = builder(summary)
    response = call_ai(prompt)
    if response.get('error') and not response.get('text'):
        return {
            'sections': {},
            'model':    'none',
            'error':    response['error'],
        }
    sections = parse_response(response['text'])
    return {
        'sections': sections,
        'model':    response['model'],
        'raw':      response['text'],
        'error':    None,
    }
