import pandas as pd
import numpy as np

# ─── Helpers ───────────────────────────────────────────────────────────────────

OCCASION_CLUSTERS = {
    'Wedding':     ['wedding', 'bride', 'bridal', 'shaadi'],
    'Engagement':  ['engagement', 'propose', 'solitaire'],
    'Gift':        ['gift', 'gifting'],
    'Baby/Kids':   ['baby', 'kids', 'child', 'children', 'newborn'],
    'Anniversary': ['anniversary', 'couple'],
    'Birthday':    ['birthday', 'bday'],
    'Festival':    ['festival', 'diwali', 'dhanteras', 'navratri', 'puja', 'rakhi', 'eid', 'christmas'],
}

def _levenshtein(s1, s2):
    """Simple Levenshtein distance."""
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]

def _cluster_spelling_variants(terms_series, searches_series, max_dist=2, sample=300):
    """Cluster terms by Levenshtein distance. Uses sampling for performance."""
    terms = list(terms_series)
    searches = list(searches_series)
    # For performance, only work on top `sample` terms
    pairs = sorted(zip(searches, terms), reverse=True)[:sample]
    searches = [p[0] for p in pairs]
    terms = [p[1] for p in pairs]

    visited = [False] * len(terms)
    clusters = []
    for i, t in enumerate(terms):
        if visited[i]:
            continue
        cluster = [i]
        for j in range(i + 1, len(terms)):
            if not visited[j] and _levenshtein(t, terms[j]) <= max_dist:
                cluster.append(j)
                visited[j] = True
        visited[i] = True
        if len(cluster) > 1:  # only show fragmented ones
            clusters.append({
                'top_variant': terms[cluster[0]],
                'variants': [terms[k] for k in cluster],
                'combined_searches': int(sum(searches[k] for k in cluster)),
                'top_variant_searches': int(searches[cluster[0]]),
                'variant_count': len(cluster),
            })
    clusters.sort(key=lambda x: x['combined_searches'], reverse=True)
    return clusters[:20]

def _safe_pct(num, denom):
    return round((num / denom) * 100, 2) if denom > 0 else 0

def _insight_concentration(top10_pct, top_term, top_term_pct):
    shape = "concentrated" if top10_pct > 40 else "distributed"
    conc_warn = (f"⚠️ Demand is highly concentrated. A catalog problem in just 10 terms "
                 f"would affect {top10_pct:.1f}% of all search traffic.") if top10_pct > 40 else ""
    return (f"The top 10 terms represent {top10_pct:.1f}% of total search volume. "
            f"'{top_term}' alone drives {top_term_pct:.1f}% of searches, indicating {shape} demand. {conc_warn}").strip()

# ─── Layer 1 ───────────────────────────────────────────────────────────────────

def run_layer1(df_curr, df_prev):
    res = {}
    if df_curr is None or df_curr.empty:
        return res

    total = df_curr['searches'].sum()

    # -- 1.1 Top 50 Terms -------------------------------------------------------
    top50 = df_curr.sort_values('searches', ascending=False).head(50)
    res['1.1'] = top50[['term_norm', 'searches', 'category', 'a2c_count', 'orders']].to_dict(orient='records')

    # -- 1.2 Volume Concentration -----------------------------------------------
    sorted_df = df_curr.sort_values('searches', ascending=False).reset_index(drop=True)
    t10  = float(sorted_df.iloc[:10]['searches'].sum())
    t50  = float(sorted_df.iloc[10:50]['searches'].sum())
    t100 = float(sorted_df.iloc[50:100]['searches'].sum())
    lt   = float(total - t10 - t50 - t100)
    top10_pct = _safe_pct(t10, total)
    top_term   = sorted_df.iloc[0]['term_norm'] if len(sorted_df) > 0 else ''
    top_term_s = float(sorted_df.iloc[0]['searches']) if len(sorted_df) > 0 else 0
    res['1.2'] = {
        'chart': [
            {'name': 'Top 10',     'value': t10,  'terms': sorted_df.iloc[:10][['term_norm','searches']].to_dict(orient='records')},
            {'name': 'Top 11–50',  'value': t50,  'terms': sorted_df.iloc[10:50][['term_norm','searches']].to_dict(orient='records')},
            {'name': 'Top 51–100', 'value': t100, 'terms': sorted_df.iloc[50:100][['term_norm','searches']].to_dict(orient='records')},
            {'name': 'Long Tail',  'value': max(0, lt), 'terms': sorted_df.iloc[100:][['term_norm','searches']].to_dict(orient='records')},
        ],
        'insight': _insight_concentration(top10_pct, top_term, _safe_pct(top_term_s, total))
    }

    # -- 1.3 Category Rollup ----------------------------------------------------
    cat = df_curr.groupby('category').agg(searches=('searches', 'sum'), revenue=('usd_revenue', 'sum')).reset_index()
    cat['search_share'] = cat['searches'].apply(lambda x: _safe_pct(x, total))
    cat['revenue_share'] = cat['revenue'].apply(lambda x: _safe_pct(x, cat['revenue'].sum()))
    cat = cat.sort_values('searches', ascending=False)
    top_cat = cat.iloc[0].to_dict() if len(cat) > 0 else None
    insight_13 = ''
    if top_cat is not None:
        rev_share = top_cat['revenue_share']
        s_share   = top_cat['search_share']
        gap = 'monetization gap' if s_share - rev_share > 10 else 'healthy conversion alignment'
        insight_13 = (f"'{top_cat['category']}' captures {s_share:.1f}% of all search demand "
                      f"but generates only {rev_share:.1f}% of revenue, indicating a {gap}.")
    res['1.3'] = {'chart': cat.to_dict(orient='records'), 'insight': insight_13}

    # -- 1.4 Category Search Share ----------------------------------------------
    cat14 = cat.copy().head(9)
    other_s = cat.iloc[9:]['searches'].sum() if len(cat) > 9 else 0
    if other_s > 0:
        other_row = pd.DataFrame([{'category': 'General Jewellery', 'searches': other_s, 'search_share': _safe_pct(other_s, total)}])
        cat14 = pd.concat([cat14, other_row], ignore_index=True)
    flags = []
    for _, row in cat.iterrows():
        if row['search_share'] > 30:
            flags.append(f"'{row['category']}' dominates at {row['search_share']:.1f}% — over-indexing risk.")
        elif row['search_share'] < 2:
            flags.append(f"'{row['category']}' has only {row['search_share']:.1f}% share — under-demand or unlaunched category.")
    res['1.4'] = {'chart': cat14[['category', 'searches', 'search_share']].fillna(0).to_dict(orient='records'), 'flags': flags}

    # -- 1.5 Long-Tail ----------------------------------------------------------
    lt_df  = df_curr[df_curr['is_long_tail'] == True]
    hd_df  = df_curr[df_curr['is_long_tail'] == False]
    lt_s   = lt_df['searches'].sum()
    hd_s   = hd_df['searches'].sum()
    lt_conv = _safe_pct(lt_df['orders'].sum(), lt_s)
    hd_conv = _safe_pct(hd_df['orders'].sum(), hd_s)
    ratio = round(lt_conv / hd_conv, 2) if hd_conv > 0 else 0
    direction = 'higher' if lt_conv >= hd_conv else 'lower'
    intent = 'more purchase-ready' if lt_conv >= hd_conv else 'less purchase-ready'
    res['1.5'] = {
        'term_count': int(len(lt_df)),
        'searches': float(lt_s),
        'pct_of_unique_terms': _safe_pct(len(lt_df), len(df_curr)),
        'pct_of_searches':     _safe_pct(lt_s, total),
        'avg_visit_rate':   round(lt_df['search_visits'].sum() / lt_s, 4) if lt_s > 0 else 0,
        'avg_conversion':   round(lt_conv, 3),
        'head_avg_conversion': round(hd_conv, 3),
        'top_terms': lt_df.sort_values('searches', ascending=False).head(20)[['term_norm','searches','a2c_count','orders']].to_dict(orient='records'),
        'insight': (f"Long-tail queries (3+ words) represent {_safe_pct(len(lt_df), len(df_curr)):.1f}% of unique terms "
                   f"but {_safe_pct(lt_s, total):.1f}% of total searches. Their avg conversion is {ratio}x {direction} "
                   f"than head terms — indicating {intent}.")
    }

    # -- 1.6 Occasion / Intent Clustering ---------------------------------------
    rows = []
    for occasion, keywords in OCCASION_CLUSTERS.items():
        mask = df_curr['term_norm'].apply(lambda t: any(k in t for k in keywords))
        sub  = df_curr[mask]
        if not sub.empty:
            rows.append({
                'occasion': occasion,
                'term_count': int(len(sub)),
                'searches':   float(sub['searches'].sum()),
                'a2c_count':  float(sub['a2c_count'].sum()),
                'orders': float(sub['orders'].sum()),
                'terms': sub.sort_values('searches', ascending=False).head(10)[['term_norm','searches']].to_dict(orient='records')
            })
    rows.sort(key=lambda x: x['searches'], reverse=True)
    top_occ = rows[0] if rows else None
    total_occ_terms = sum(r['term_count'] for r in rows)
    total_occ_s = sum(r['searches'] for r in rows)
    res['1.6'] = {
        'clusters': rows,
        'insight': (f"Occasion-linked searches span {total_occ_terms} terms and {int(total_occ_s):,} total searches. "
                   f"'{top_occ['occasion']}' leads with {int(top_occ['searches']):,} searches." if top_occ else "No occasion-linked terms detected.")
    }

    # -- 1.7 Spelling Variant Grouping ------------------------------------------
    clusters = _cluster_spelling_variants(df_curr['term_norm'], df_curr['searches'])
    res['1.7'] = {
        'clusters': clusters,
        'insight': (f"Search demand for '{clusters[0]['top_variant']}' is fragmented across {clusters[0]['variant_count']} variants. "
                   f"True combined demand is {_safe_pct(clusters[0]['combined_searches'] - clusters[0]['top_variant_searches'], clusters[0]['top_variant_searches']):.1f}% "
                   f"higher than the top variant alone suggests." if clusters else "No significant spelling variants detected.")
    }

    # ── Period comparisons (need both) ──────────────────────────────────────────
    if df_prev is None or df_prev.empty:
        return res

    merged = pd.merge(
        df_curr[['term_norm','searches','category','a2c_count','orders']],
        df_prev[['term_norm','searches','category']].rename(columns={'searches':'prev_searches','category':'prev_category'}),
        on='term_norm', how='outer'
    ).fillna(0)
    merged['growth'] = ((merged['searches'] - merged['prev_searches']) / (merged['prev_searches'] + 1)) * 100

    # -- 1.8 WoW/MoM Change Per Term -------------------------------------------
    valid = merged[(merged['searches'] >= 100) | (merged['prev_searches'] >= 100)].copy()
    gainers = valid.sort_values('growth', ascending=False).head(15)
    losers  = valid.sort_values('growth', ascending=True).head(15)
    res['1.8'] = {
        'gainers': gainers[['term_norm','prev_searches','searches','growth']].to_dict(orient='records'),
        'losers':  losers[['term_norm','prev_searches','searches','growth']].to_dict(orient='records'),
        'insight': (f"'{gainers.iloc[0]['term_norm']}' grew {gainers.iloc[0]['growth']:.1f}% MoM — the highest growth in the dataset." if len(gainers) > 0 else '')
    }

    # -- 1.9 Rising Terms -------------------------------------------------------
    rising = merged[(merged['growth'] > 20) & (merged['searches'] >= 200) & (merged['prev_searches'] > 0)]
    zero_a2c = rising[rising['a2c_count'] == 0]
    res['1.9'] = {
        'terms': rising.sort_values('growth', ascending=False).head(30)[['term_norm','prev_searches','searches','growth','category','a2c_count']].to_dict(orient='records'),
        'insight': (f"{len(rising)} terms are rising >20% this period. "
                   f"{len(zero_a2c)} of them have zero A2C — rising demand not yet converting. Immediate catalog/relevance fix needed.")
    }

    # -- 1.10 Falling Terms -----------------------------------------------------
    falling = merged[(merged['growth'] < -20) & (merged['prev_searches'] >= 200)]
    res['1.10'] = {
        'terms': falling.sort_values('growth').head(30)[['term_norm','prev_searches','searches','growth','category','orders']].to_dict(orient='records'),
        'insight': (f"{len(falling)} terms declined >20% MoM. "
                   f"{int((falling['orders'] > 0).sum())} of them were generating purchases — active demand risk.")
    }

    # -- 1.11 New Term Appearances ----------------------------------------------
    new_terms = merged[(merged['prev_searches'] == 0) & (merged['searches'] > 0)].sort_values('searches', ascending=False).head(30)
    has_purchase = (new_terms['orders'] > 0).sum()
    res['1.11'] = {
        'terms': new_terms[['term_norm','searches','category','a2c_count','orders']].to_dict(orient='records'),
        'insight': (f"{len(new_terms)} entirely new search terms appeared this period. "
                   f"{int(has_purchase)} of them already have purchases — strong organic product-market fit signal.")
    }

    # -- 1.12 Vanishing Terms ---------------------------------------------------
    vanished = merged[(merged['searches'] == 0) & (merged['prev_searches'] > 0) & (merged['orders'] > 0)]
    res['1.12'] = {
        'terms': vanished.sort_values('prev_searches', ascending=False).head(20)[['term_norm','prev_searches','searches','orders']].to_dict(orient='records'),
        'insight': (f"{len(vanished)} revenue-generating terms disappeared from search this period. "
                   f"Investigate whether catalog was removed or external demand shifted.")
    }

    # -- 1.13 Breakout Detection ------------------------------------------------
    breakouts = merged[(merged['growth'] > 100) & (merged['prev_searches'] > 0)].sort_values('growth', ascending=False)
    res['1.13'] = {
        'terms': breakouts[['term_norm','prev_searches','searches','growth','category','a2c_count','orders']].to_dict(orient='records'),
        'insight': (f"{len(breakouts)} terms show 100%+ MoM growth. These are highest priority for catalog deepening and marketing amplification.")
    }

    # -- 1.14 Category Share Shift ----------------------------------------------
    curr_cat = df_curr.groupby('category')['searches'].sum().reset_index()
    prev_cat = df_prev.groupby('category')['searches'].sum().reset_index()
    curr_cat['curr_share'] = curr_cat['searches'] / curr_cat['searches'].sum() * 100
    prev_cat['prev_share'] = prev_cat['searches'] / prev_cat['searches'].sum() * 100
    shift = pd.merge(curr_cat[['category','curr_share']], prev_cat[['category','prev_share']], on='category', how='outer').fillna(0)
    shift['delta'] = shift['curr_share'] - shift['prev_share']
    shift = shift.sort_values('delta', ascending=False)
    top_shift = shift.iloc[0].to_dict() if len(shift) > 0 else None
    res['1.14'] = {
        'chart': shift.to_dict(orient='records'),
        'insight': (f"'{top_shift['category']}' gained {top_shift['delta']:.1f}pp of search share — the highest shift. "
                   f"Monitor whether this is seasonal, trend-driven, or campaign-driven." if top_shift is not None else '')
    }

    return res

# ─── Layer 2 ───────────────────────────────────────────────────────────────────

MEN_KEYWORDS = ['men', 'gents', 'male', ' him', 'boys', 'gentleman', 'unisex', "men's", 'boys']
GEMSTONE_KEYWORDS = ['ruby', 'emerald', 'sapphire', 'pearl', 'polki', 'kundan', 'coral',
                     'tanzanite', 'amethyst', 'topaz', 'opal']

def run_layer2(df_curr, df_prev):
    res = {}
    if df_curr is None or df_curr.empty:
        return res

    total_s   = df_curr['searches'].sum()
    total_a2c = df_curr['a2c_count'].sum() if 'a2c_count' in df_curr.columns else 0
    total_rev = df_curr['usd_revenue'].sum() if 'usd_revenue' in df_curr.columns else 0
    site_conv = _safe_pct(df_curr['orders'].sum(), total_s)

    # ── 2.1 Unique Search Term Variations Per Category ──────────────────────────
    cat_agg = df_curr.groupby('category').agg(
        unique_terms=('term_norm','count'),
        searches=('searches','sum'),
        a2c_count=('a2c_count','sum'),
        orders=('orders','sum'),
        revenue=('usd_revenue','sum')
    ).reset_index()
    cat_agg['searches_per_term'] = (cat_agg['searches'] / cat_agg['unique_terms'].replace(0, np.nan)).round(1)
    cat_agg['search_share']      = cat_agg['searches'].apply(lambda x: _safe_pct(x, total_s))
    cat_agg['a2c_share']         = cat_agg['a2c_count'].apply(lambda x: _safe_pct(x, total_a2c))
    cat_agg['revenue_share']     = cat_agg['revenue'].apply(lambda x: _safe_pct(x, total_rev))
    cat_agg['conversion_rate']   = (cat_agg['orders'] / cat_agg['searches'].replace(0, np.nan) * 100).round(3)

    top21 = cat_agg.sort_values('unique_terms', ascending=False).iloc[0].to_dict() if len(cat_agg) > 0 else None

    # Helper: drill-down terms per category (defined once, reused everywhere)
    def _cat_terms(cat_name):
        sub = df_curr[df_curr['category'] == cat_name]
        return sub.sort_values('searches', ascending=False).head(30)[['term_norm','searches','a2c_count','orders']].to_dict(orient='records')

    table_21 = []
    for _, r in cat_agg.fillna(0).sort_values('searches', ascending=False).iterrows():
        table_21.append({**r.to_dict(), 'terms': _cat_terms(r['category'])})
    res['2.1'] = {
        'table': table_21,
        'insight': (f"'{top21['category']}' has {int(top21['unique_terms'])} unique search variations — "
                    f"the widest vocabulary in the dataset. This suggests high user intent diversity "
                    f"and a need for broad catalog coverage." if top21 is not None else '')
    }

    # ── 2.2 Category Conversion Rate Benchmark ──────────────────────────────────
    conv_sorted = cat_agg.sort_values('conversion_rate', ascending=False).fillna(0)
    top_c  = conv_sorted.iloc[0].to_dict()  if len(conv_sorted) > 0 else None
    bot_c  = conv_sorted.iloc[-1].to_dict() if len(conv_sorted) > 1 else None
    gap    = round(top_c['conversion_rate'] / bot_c['conversion_rate'], 1) if bot_c is not None and bot_c['conversion_rate'] > 0 else 0


    conv_rows = []
    for _, r in conv_sorted.iterrows():
        conv_rows.append({**r.to_dict(), 'terms': _cat_terms(r['category'])})

    res['2.2'] = {
        'table': conv_rows,
        'insight': (f"Top converting category: '{top_c['category']}' at {top_c['conversion_rate']:.2f}%. "
                    f"Bottom: '{bot_c['category']}' at {bot_c['conversion_rate']:.2f}%. "
                    f"Gap of {gap}x between best and worst — opportunity to apply top-category "
                    f"merchandising patterns to underperformers." if top_c is not None and bot_c is not None else '')
    }

    # ── 2.3 Category Revenue Share ───────────────────────────────────────────────
    rev_sorted = cat_agg.sort_values('revenue', ascending=False).fillna(0)
    # Find highest density (revenue_share / search_share)
    rev_sorted['density'] = (rev_sorted['revenue_share'] / rev_sorted['search_share'].replace(0, np.nan)).round(2)
    top_dens  = rev_sorted.sort_values('density', ascending=False).iloc[0].to_dict() if len(rev_sorted) > 0 else None
    mon_gap   = rev_sorted[rev_sorted['search_share'] - rev_sorted['revenue_share'] > 10]
    mon_row   = mon_gap.sort_values('search_share', ascending=False).iloc[0].to_dict() if len(mon_gap) > 0 else None

    rev_rows = []
    for _, r in rev_sorted.iterrows():
        rev_rows.append({**r.to_dict(), 'terms': _cat_terms(r['category'])})

    res['2.3'] = {
        'table': rev_rows,
        'insight': (
            (f"'{top_dens['category']}' generates {top_dens['revenue_share']:.1f}% of revenue "
             f"from {top_dens['search_share']:.1f}% of searches — highest revenue density. " if top_dens is not None else '') +
            (f"'{mon_row['category']}' has {mon_row['search_share']:.1f}% of searches "
             f"but only {mon_row['revenue_share']:.1f}% of revenue — monetization gap." if mon_row is not None else '')
        )
    }

    # ── 2.4 Category A2C Share vs Search Share ───────────────────────────────────
    a2c_scatter = cat_agg[['category','search_share','a2c_share','unique_terms']].fillna(0).copy()
    a2c_scatter['over_index'] = a2c_scatter['a2c_share'] > a2c_scatter['search_share']
    res['2.4'] = {
        'points': a2c_scatter.to_dict(orient='records'),
        'insight': ("Categories above the parity line are over-converting browsers to cart adds "
                    "relative to their search share — strong product-page resonance. "
                    "Categories below are under-converting and need product page or relevance improvements.")
    }

    # ── 2.5 Long-Tail Depth by Category ─────────────────────────────────────────
    lt_cat = df_curr.groupby('category').apply(
        lambda g: pd.Series({
            'lt_searches': g.loc[g['is_long_tail'] == True, 'searches'].sum(),
            'hd_searches': g.loc[g['is_long_tail'] == False, 'searches'].sum(),
            'lt_pct':      _safe_pct(g.loc[g['is_long_tail'] == True, 'searches'].sum(), g['searches'].sum()),
        })
    ).reset_index()
    top_lt = lt_cat.sort_values('lt_pct', ascending=False).iloc[0].to_dict() if len(lt_cat) > 0 else None
    # Attach terms to each row for drill-down
    lt_rows = [{**r.to_dict(), 'terms': _cat_terms(r['category'])} for _, r in lt_cat.iterrows()]
    res['2.5'] = {
        'table': lt_rows,
        'insight': (f"'{top_lt['category']}' at {top_lt['lt_pct']:.1f}% long-tail = most specific buyer intent "
                    f"(mature demand — users know exactly what they want)." if top_lt is not None else '')
    }

    # ── 2.6 Searches per $1 Revenue (Efficiency) ────────────────────────────────
    eff = cat_agg[cat_agg['revenue'] > 0].copy()
    eff['searches_per_dollar'] = (eff['searches'] / eff['revenue']).round(2)
    eff = eff.sort_values('searches_per_dollar')
    best  = eff.iloc[0].to_dict()  if len(eff) > 0 else None
    worst = eff.iloc[-1].to_dict() if len(eff) > 1 else None
    eff_rows = [{**r.to_dict(), 'terms': _cat_terms(r['category'])} for _, r in eff.iterrows()]
    res['2.6'] = {
        'table': eff_rows,
        'insight': (f"'{best['category']}' requires only {best['searches_per_dollar']:.1f} searches to generate $1 of revenue — most efficient. "
                    f"'{worst['category']}' requires {worst['searches_per_dollar']:.1f} searches per $1 — "
                    f"investigate catalog depth and pricing." if best is not None and worst is not None else '')
    }

    # ── 2.7 Men's Jewelry Intent ─────────────────────────────────────────────────
    men_mask = df_curr['term_norm'].apply(lambda t: any(k in t for k in MEN_KEYWORDS))
    men_df   = df_curr[men_mask]
    men_s    = float(men_df['searches'].sum())
    men_conv = _safe_pct(men_df['orders'].sum(), men_s)
    gap_men  = round(men_conv - site_conv, 2)
    gap_dir  = 'above' if gap_men >= 0 else 'below'
    res['2.7'] = {
        'term_count': int(len(men_df)),
        'searches':   men_s,
        'pct_of_total': _safe_pct(men_s, total_s),
        'a2c_count':  float(men_df['a2c_count'].sum()),
        'orders': float(men_df['orders'].sum()),
        'conversion': men_conv,
        'site_conversion': site_conv,
        'terms': men_df.sort_values('searches', ascending=False).head(30)[['term_norm','searches','a2c_count','orders','category']].to_dict(orient='records'),
        'insight': (f"Men's jewelry intent represents {int(len(men_df))} unique terms and {int(men_s):,} total searches "
                    f"= {_safe_pct(men_s, total_s):.1f}% of total site demand. Conversion rate is {men_conv:.2f}% "
                    f"vs. site average of {site_conv:.2f}% — {abs(gap_men):.2f}pp {gap_dir} site average.")
    }

    # ── 2.8 Gemstone Intent Analysis ─────────────────────────────────────────────
    gem_rows = []
    for gem in GEMSTONE_KEYWORDS:
        sub = df_curr[df_curr['term_norm'].str.contains(gem, na=False)]
        if not sub.empty:
            s = float(sub['searches'].sum())
            gem_rows.append({
                'gemstone': gem,
                'term_count': int(len(sub)),
                'searches': s,
                'a2c_count': float(sub['a2c_count'].sum()),
                'orders': float(sub['orders'].sum()),
                'a2c_rate': _safe_pct(sub['a2c_count'].sum(), s),
                'terms': sub.sort_values('searches', ascending=False).head(10)[['term_norm','searches','a2c_count','orders']].to_dict(orient='records')
            })
    gem_rows.sort(key=lambda x: x['searches'], reverse=True)
    top_gem   = gem_rows[0] if gem_rows else None
    top_a2c   = max(gem_rows, key=lambda x: x['a2c_rate']) if gem_rows else None
    res['2.8'] = {
        'gems': gem_rows,
        'insight': (f"'{top_gem['gemstone']}' has the most search demand ({int(top_gem['searches']):,} searches). "
                    f"'{top_a2c['gemstone']}' has the strongest cart intent ({top_a2c['a2c_rate']:.2f}% A2C rate) "
                    f"despite {'lower' if top_a2c != top_gem else 'equal'} overall volume." if top_gem else 'No gemstone terms detected.')
    }

    # ── Period-comparison analyses ───────────────────────────────────────────────
    if df_prev is None or df_prev.empty:
        return res

    prev_cat_agg = df_prev.groupby('category').agg(
        unique_terms=('term_norm','count'),
        searches=('searches','sum'),
        a2c_count=('a2c_count','sum'),
        orders=('orders','sum'),
        revenue=('usd_revenue','sum')
    ).reset_index()
    prev_cat_agg['a2c_rate_prev'] = (prev_cat_agg['a2c_count'] / prev_cat_agg['searches'].replace(0, np.nan)).fillna(0)
    cat_agg['a2c_rate_curr']      = (cat_agg['a2c_count'] / cat_agg['searches'].replace(0, np.nan)).fillna(0)

    # ── 2.9 Category Breakout Index ───────────────────────────────────────────────
    merged_cat = pd.merge(
        cat_agg[['category','searches','a2c_rate_curr','unique_terms']],
        prev_cat_agg[['category','searches','a2c_rate_prev','unique_terms']].rename(
            columns={'searches':'prev_searches','unique_terms':'prev_unique_terms'}),
        on='category', how='outer'
    ).fillna(0)
    merged_cat['search_growth']     = ((merged_cat['searches'] - merged_cat['prev_searches']) / (merged_cat['prev_searches'] + 1) * 100).clip(-200,500)
    merged_cat['a2c_rate_change']   = ((merged_cat['a2c_rate_curr'] - merged_cat['a2c_rate_prev']) / (merged_cat['a2c_rate_prev'] + 0.001) * 100).clip(-200,500)
    merged_cat['term_count_growth'] = ((merged_cat['unique_terms'] - merged_cat['prev_unique_terms']) / (merged_cat['prev_unique_terms'] + 1) * 100).clip(-200,500)
    merged_cat['breakout_score']    = (
        merged_cat['search_growth'] * 0.4 +
        merged_cat['a2c_rate_change'] * 0.4 +
        merged_cat['term_count_growth'] * 0.2
    ).round(1)

    def _primary_driver(row):
        drivers = {
            'search growth': row['search_growth'],
            'A2C improvement': row['a2c_rate_change'],
            'vocabulary expansion': row['term_count_growth'],
        }
        return max(drivers, key=drivers.get)

    breakout_rows = []
    for _, r in merged_cat.sort_values('breakout_score', ascending=False).iterrows():
        breakout_rows.append({**r.to_dict(), 'primary_driver': _primary_driver(r)})
    top_bo = breakout_rows[0] if breakout_rows else None
    res['2.9'] = {
        'categories': breakout_rows,
        'insight': (f"'{top_bo['category']}' is the breakout category this period with score {top_bo['breakout_score']:.0f}. "
                    f"Primary driver: {top_bo['primary_driver']}." if top_bo else '')
    }

    # ── 2.10 Category Search Share Shift ─────────────────────────────────────────
    prev_s_total = df_prev['searches'].sum()
    curr_s_total = df_curr['searches'].sum()
    curr_share = df_curr.groupby('category')['searches'].sum().reset_index()
    prev_share = df_prev.groupby('category')['searches'].sum().reset_index()
    curr_share['curr_share'] = (curr_share['searches'] / curr_s_total * 100).round(2)
    prev_share['prev_share'] = (prev_share['searches'] / prev_s_total * 100).round(2)
    shift = pd.merge(curr_share[['category','curr_share']], prev_share[['category','prev_share']], on='category', how='outer').fillna(0)
    shift['delta'] = (shift['curr_share'] - shift['prev_share']).round(2)
    shift = shift.sort_values('delta', ascending=False)
    gainers = shift[shift['delta'] > 3]
    losers  = shift[shift['delta'] < -3]
    res['2.10'] = {
        'chart': shift.to_dict(orient='records'),
        'insight': (f"{len(gainers)} categories gained >3pp of share; {len(losers)} lost >3pp. "
                    f"'{shift.iloc[0]['category']}' gained {shift.iloc[0]['delta']:.1f}pp — monitor seasonal vs. trend drivers." if len(shift) > 0 else '')
    }

    # ── 2.11 New Search Terms Per Category ───────────────────────────────────────
    all_terms_curr = set(df_curr['term_norm'].dropna())
    all_terms_prev = set(df_prev['term_norm'].dropna())
    new_terms_set  = all_terms_curr - all_terms_prev
    new_df = df_curr[df_curr['term_norm'].isin(new_terms_set)]
    new_by_cat = new_df.groupby('category').agg(new_terms=('term_norm','count'), searches=('searches','sum')).reset_index()
    new_by_cat = new_by_cat.sort_values('new_terms', ascending=False)
    top_new = new_by_cat.iloc[0] if len(new_by_cat) > 0 else None

    new_by_cat_with_terms = []
    for _, r in new_by_cat.iterrows():
        sub = new_df[new_df['category'] == r['category']].sort_values('searches', ascending=False).head(15)
        new_by_cat_with_terms.append({**r.to_dict(), 'terms': sub[['term_norm','searches']].to_dict(orient='records')})

    res['2.11'] = {
        'by_category': new_by_cat_with_terms,
        'total_new': int(len(new_terms_set)),
        'insight': (f"'{top_new['category']}' added the most new search vocabulary — {int(top_new['new_terms'])} new terms. "
                    f"This signals expanding consumer awareness or new product interest." if top_new is not None else '')
    }

    # ── 2.12 Long-Tail Expansion by Category ─────────────────────────────────────
    def _lt_pct_by_cat(df):
        g = df.groupby('category').apply(
            lambda x: _safe_pct(x.loc[x['is_long_tail'] == True, 'searches'].sum(), x['searches'].sum())
        ).reset_index(name='lt_pct')
        return g

    curr_lt = _lt_pct_by_cat(df_curr)
    prev_lt = _lt_pct_by_cat(df_prev)
    lt_exp  = pd.merge(curr_lt, prev_lt, on='category', suffixes=('_curr','_prev'), how='outer').fillna(0)
    lt_exp['delta'] = (lt_exp['lt_pct_curr'] - lt_exp['lt_pct_prev']).round(2)
    lt_exp = lt_exp.sort_values('delta', ascending=False)
    top_lt_exp = lt_exp.iloc[0] if len(lt_exp) > 0 else None
    res['2.12'] = {
        'chart': lt_exp.to_dict(orient='records'),
        'insight': (f"'{top_lt_exp['category']}' shows the highest long-tail expansion at +{top_lt_exp['delta']:.1f}pp. "
                    f"When long-tail% increases, demand is maturing — buyers are becoming more specific." if top_lt_exp is not None else '')
    }

    return res


# ─── KPIs ──────────────────────────────────────────────────────────────────────

def run_kpis(df_curr, df_prev):
    if df_curr is None or df_curr.empty:
        return {}

    searches = float(df_curr['searches'].sum())
    visits   = float(df_curr['search_visits'].sum()) if 'search_visits' in df_curr.columns else 0
    a2cs     = float(df_curr['a2c_count'].sum()) if 'a2c_count' in df_curr.columns else 0
    orders   = float(df_curr['orders'].sum()) if 'orders' in df_curr.columns else 0
    revenue  = float(df_curr['usd_revenue'].sum()) if 'usd_revenue' in df_curr.columns else 0

    kpis = {
        'searches':       searches,
        'unique_terms':   len(df_curr),
        'visit_rate':     visits / searches if searches > 0 else 0,
        'a2c_count':      a2cs,
        'a2c_rate':       a2cs / searches if searches > 0 else 0,
        'orders':         orders,
        'e2e_conv':       orders / searches if searches > 0 else 0,
        'revenue':        revenue,
        'rev_per_search': revenue / searches if searches > 0 else 0,
    }

    if df_prev is not None and not df_prev.empty:
        p = float(df_prev['searches'].sum())
        kpis['searches_growth'] = round(((searches - p) / (p + 1)) * 100, 2)

    return kpis


# ─── Layer 3 ───────────────────────────────────────────────────────────────────

def run_layer3(df_curr, df_prev):
    res = {}
    if df_curr is None or df_curr.empty:
        return res

    df = df_curr.copy()

    # Compute per-term funnel rates
    df['visit_rate']    = (df['search_visits'] / df['searches'].replace(0, np.nan)).fillna(0).round(4)
    df['a2c_rate_v']    = (df['a2c_count'] / df['search_visits'].replace(0, np.nan)).fillna(0).round(4)
    df['a2c_rate_s']    = (df['a2c_count'] / df['searches'].replace(0, np.nan)).fillna(0).round(4)
    df['purchase_rate'] = (df['orders'] / df['a2c_count'].replace(0, np.nan)).fillna(0).round(4)
    df['e2e_conv']      = (df['orders'] / df['searches'].replace(0, np.nan)).fillna(0).round(6)
    df['a2c_abandon']   = (df['a2c_count'] - df['orders']).clip(lower=0)

    # ── 3.1 Search → Visit Rate Per Term ─────────────────────────────────────
    top100 = df.sort_values('searches', ascending=False).head(100)
    low_vr_count = int((top100['visit_rate'] < 0.2).sum())
    avg_vr = float(df['visit_rate'].mean())
    vr_clipped = df['visit_rate'].clip(0, 1)
    hist_counts, _ = np.histogram(vr_clipped, bins=[i/10 for i in range(11)])
    hist_labels = [f"{i*10}–{(i+1)*10}%" for i in range(10)]
    res['3.1'] = {
        'histogram': [{'label': l, 'count': int(c)} for l, c in zip(hist_labels, hist_counts)],
        'bottom20': top100.sort_values('visit_rate').head(20)[
            ['term_norm','searches','search_visits','visit_rate','category']].to_dict(orient='records'),
        'avg_visit_rate': round(avg_vr, 4),
        'insight': (f"{low_vr_count} of the top 100 terms have <20% visit rate — highest priority for search relevance fix. "
                   f"Overall average visit rate: {avg_vr*100:.1f}%. Low visit rate means results are not relevant or compelling.")
    }

    # ── 3.2 Visit Rate vs A2C Rate Scatter ────────────────────────────────────
    scatter_df = df[(df['search_visits'] >= 20) | (df['searches'] >= 100)].copy()
    res['3.2'] = {
        'points': scatter_df[['term_norm','visit_rate','a2c_rate_v','a2c_rate_s','category','searches']].to_dict(orient='records'),
        'insight': ("High visit rate + low A2C rate = product pages are not compelling. "
                   "Low visit + high A2C among those who visit = good product, poor discoverability.")
    }

    # ── 3.3 A2C → Purchase Rate Per Term ─────────────────────────────────────
    top_a2c = df[df['a2c_count'] > 0].sort_values('a2c_count', ascending=False).head(20)
    top_a2c_t = top_a2c.iloc[0].to_dict() if len(top_a2c) > 0 else None
    res['3.3'] = {
        'terms': top_a2c[['term_norm','a2c_count','orders','purchase_rate','searches','category']].to_dict(orient='records'),
        'insight': (f"'{top_a2c_t['term_norm']}' has the highest A2C ({int(top_a2c_t['a2c_count'])}) "
                   f"but {top_a2c_t['purchase_rate']*100:.1f}% purchase rate — strong cart intent with high abandonment. "
                   f"Likely cause: price, trust, or complexity of buying decision." if top_a2c_t else '')
    }

    # ── 3.4 E2E Conversion Ranking (>=500 searches) ───────────────────────────
    high_vol = df[df['searches'] >= 500]
    top_conv = high_vol.sort_values('e2e_conv', ascending=False).head(20)
    bot_conv = high_vol.sort_values('e2e_conv').head(20)
    top_list = top_conv['term_norm'].head(5).tolist()
    res['3.4'] = {
        'top20':   top_conv[['term_norm','searches','visit_rate','a2c_rate_s','e2e_conv','category','usd_revenue']].to_dict(orient='records'),
        'bottom20': bot_conv[['term_norm','searches','visit_rate','a2c_rate_s','e2e_conv','category','usd_revenue']].to_dict(orient='records'),
        'insight': (f"Top converters: {', '.join(top_list)}. These have the cleanest demand-to-purchase pathway. "
                   f"Replicate their catalog and PDP patterns across underperforming terms.")
    }

    # ── 3.5 Category Funnel Benchmarks ────────────────────────────────────────
    cat_f = df.groupby('category').agg(
        avg_visit_rate=('visit_rate','mean'),
        avg_a2c_rate=('a2c_rate_s','mean'),
        avg_purchase_rate=('purchase_rate','mean'),
        avg_e2e_conv=('e2e_conv','mean'),
        searches=('searches','sum')
    ).reset_index().fillna(0)
    best_cat  = cat_f.sort_values('avg_e2e_conv', ascending=False).iloc[0].to_dict() if len(cat_f) > 0 else None
    worst_cat = cat_f.sort_values('avg_e2e_conv').iloc[0].to_dict() if len(cat_f) > 0 else None
    res['3.5'] = {
        'categories': cat_f.sort_values('searches', ascending=False).to_dict(orient='records'),
        'insight': (f"'{best_cat['category']}' has the highest full-funnel efficiency "
                   f"(E2E {best_cat['avg_e2e_conv']*100:.3f}%). "
                   f"'{worst_cat['category']}' has the worst. Apply top-category merchandising patterns to underperformers."
                   if best_cat and worst_cat else '')
    }

    # ── 3.6 Zero-Order, High A2C ──────────────────────────────────────────────
    z6 = df[(df['orders'] == 0) & (df['a2c_count'] >= 100)].sort_values('a2c_count', ascending=False)
    res['3.6'] = {
        'terms': z6[['term_norm','searches','search_visits','a2c_count','orders','category']].head(30).to_dict(orient='records'),
        'count': int(len(z6)),
        'insight': ("Users are carting these terms but never completing purchase. "
                   "Root causes: price too high, no Buy Now path, COD not available, or trust gap on product page.")
    }

    # ── 3.7 Zero-A2C, High Visits ─────────────────────────────────────────────
    z7 = df[(df['a2c_count'] == 0) & (df['search_visits'] >= 200)].sort_values('search_visits', ascending=False)
    res['3.7'] = {
        'terms': z7[['term_norm','searches','search_visits','a2c_count','category']].head(30).to_dict(orient='records'),
        'count': int(len(z7)),
        'insight': ("Users are seeing search results but nothing is carted. "
                   "Root causes: wrong products surfaced, zero inventory, or irrelevant results.")
    }

    # ── 3.8 Zero-Conv High-Traffic ────────────────────────────────────────────
    z8 = df[(df['orders'] == 0) & (df['searches'] >= 1000)].sort_values('searches', ascending=False).head(15)
    lost_s  = float(z8['searches'].sum())
    avg_e2e = float(df['e2e_conv'].mean())
    total_p = df['orders'].sum()
    total_r = df['usd_revenue'].sum() if 'usd_revenue' in df.columns else 0
    avg_aov = (total_r / total_p) if total_p > 0 else 0
    pot_rev = lost_s * avg_e2e * avg_aov
    res['3.8'] = {
        'terms': z8[['term_norm','searches','search_visits','a2c_count','category']].to_dict(orient='records'),
        'total_searches': lost_s,
        'potential_revenue': pot_rev,
        'insight': (f"These {len(z8)} terms represent {int(lost_s):,} searches with zero revenue. "
                   f"At site average AOV and conversion, ~${pot_rev:,.0f} in potential revenue is being lost monthly.")
    }

    # ── 3.9 Funnel Stage Classification ──────────────────────────────────────
    def _classify(row):
        if row['visit_rate'] < 0.25:    return 'Stage 1 — Low Click-Through'
        if row['a2c_rate_v'] < 0.05:    return 'Stage 2 — Low Cart Rate'
        if row['purchase_rate'] < 0.01: return 'Stage 3 — High Abandonment'
        return 'Healthy'
    df['funnel_stage'] = df.apply(_classify, axis=1)
    stage_counts = df['funnel_stage'].value_counts().reset_index()
    stage_counts.columns = ['stage', 'count']
    top_stage = str(df['funnel_stage'].mode().iloc[0]) if len(df) > 0 else ''
    stage_desc = {
        'Stage 1 — Low Click-Through': 'search relevance / result quality',
        'Stage 2 — Low Cart Rate': 'catalog or product page quality',
        'Stage 3 — High Abandonment': 'checkout friction or pricing',
        'Healthy': 'all stages performing'
    }
    res['3.9'] = {
        'stage_counts': stage_counts.to_dict(orient='records'),
        'terms': df[['term_norm','searches','visit_rate','a2c_rate_v','purchase_rate','e2e_conv','funnel_stage','category']].sort_values('searches', ascending=False).head(100).to_dict(orient='records'),
        'insight': (f"The most common failure is '{top_stage}' affecting {int((df['funnel_stage']==top_stage).sum())} terms. "
                   f"This points to a systemic {stage_desc.get(top_stage, '')} problem rather than individual term issues. "
                   f"(Thresholds: Stage 1 = <25% Visit Rate; Stage 2 = <5% A2C/Visit; Stage 3 = <1% Purch/A2C).")
    }

    # ── 3.10 A2C-to-Purchase Gap ──────────────────────────────────────────────
    t10 = df.sort_values('a2c_abandon', ascending=False).head(15)
    t10_top = t10.iloc[0].to_dict() if len(t10) > 0 else None
    res['3.10'] = {
        'terms': t10[['term_norm','a2c_count','orders','a2c_abandon','searches','category']].to_dict(orient='records'),
        'insight': (f"'{t10_top['term_norm']}' has the largest cart abandonment gap at {int(t10_top['a2c_abandon'])} carts. "
                   f"This is the highest-value retargeting and checkout-optimization opportunity." if t10_top else '')
    }

    if df_prev is None or df_prev.empty:
        return res

    # ── Compute prev period funnel rates ─────────────────────────────────────
    dp = df_prev.copy()
    dp['visit_rate']    = (dp['search_visits'] / dp['searches'].replace(0, np.nan)).fillna(0).round(4)
    dp['a2c_rate_s']    = (dp['a2c_count'] / dp['searches'].replace(0, np.nan)).fillna(0).round(4)
    dp['a2c_rate_v']    = (dp['a2c_count'] / dp['search_visits'].replace(0, np.nan)).fillna(0).round(4)
    dp['purchase_rate'] = (dp['orders'] / dp['a2c_count'].replace(0, np.nan)).fillna(0).round(4)
    dp['e2e_conv']      = (dp['orders'] / dp['searches'].replace(0, np.nan)).fillna(0).round(6)

    merged = pd.merge(
        df[['term_norm','searches','visit_rate','a2c_rate_s','a2c_rate_v','purchase_rate','e2e_conv','category','a2c_count','orders','usd_revenue']],
        dp[['term_norm','visit_rate','a2c_rate_s','a2c_rate_v','purchase_rate','e2e_conv','orders']].rename(
            columns={'visit_rate':'prev_vr','a2c_rate_s':'prev_a2c_s','a2c_rate_v':'prev_a2c_v',
                     'purchase_rate':'prev_pr','e2e_conv':'prev_e2e','orders':'prev_orders'}),
        on='term_norm', how='inner'
    )

    # ── 3.11 Visit Rate Change ────────────────────────────────────────────────
    merged['vr_delta'] = (merged['visit_rate'] - merged['prev_vr']).round(4)
    res['3.11'] = {
        'improvers': merged.sort_values('vr_delta', ascending=False).head(15)[['term_norm','prev_vr','visit_rate','vr_delta','searches','category']].to_dict(orient='records'),
        'degraders': merged.sort_values('vr_delta').head(15)[['term_norm','prev_vr','visit_rate','vr_delta','searches','category']].to_dict(orient='records'),
        'insight': "Visit rate improved → search relevance improved. Degraded → results may have changed or become less relevant."
    }

    # ── 3.12 A2C Rate Change ──────────────────────────────────────────────────
    merged['a2c_delta'] = (merged['a2c_rate_s'] - merged['prev_a2c_s']).round(4)
    res['3.12'] = {
        'improvers': merged.sort_values('a2c_delta', ascending=False).head(15)[['term_norm','prev_a2c_s','a2c_rate_s','a2c_delta','searches','category']].to_dict(orient='records'),
        'degraders': merged.sort_values('a2c_delta').head(15)[['term_norm','prev_a2c_s','a2c_rate_s','a2c_delta','searches','category']].to_dict(orient='records'),
        'insight': "A2C rate improving = growing product-market fit. Declining despite stable search = something changed on product/pricing."
    }

    # ── 3.13 A2C→Purchase Rate Change ────────────────────────────────────────
    merged['pr_delta'] = (merged['purchase_rate'] - merged['prev_pr']).round(4)
    res['3.13'] = {
        'improvers': merged.sort_values('pr_delta', ascending=False).head(15)[['term_norm','prev_pr','purchase_rate','pr_delta','a2c_count','category']].to_dict(orient='records'),
        'degraders': merged.sort_values('pr_delta').head(15)[['term_norm','prev_pr','purchase_rate','pr_delta','a2c_count','category']].to_dict(orient='records'),
        'insight': "Declining checkout rate = cart abandonment worsening. Causes: price increase, checkout friction, competitor availability."
    }

    # ── 3.14 Funnel Stage Regression ─────────────────────────────────────────
    reg = []
    for _, r in merged.iterrows():
        issues = []
        if r['prev_vr'] > 0 and r['visit_rate'] < r['prev_vr'] * 0.9:
            issues.append(f"Visit rate ↓{((r['prev_vr']-r['visit_rate'])/r['prev_vr']*100):.1f}%")
        if r['prev_a2c_v'] > 0 and r['a2c_rate_v'] < r['prev_a2c_v'] * 0.9:
            issues.append(f"A2C rate ↓{((r['prev_a2c_v']-r['a2c_rate_v'])/r['prev_a2c_v']*100):.1f}%")
        if r['prev_pr'] > 0 and r['purchase_rate'] < r['prev_pr'] * 0.9:
            issues.append(f"Purchase rate ↓{((r['prev_pr']-r['purchase_rate'])/r['prev_pr']*100):.1f}%")
        if issues:
            reg.append({'term_norm': r['term_norm'], 'searches': r['searches'], 'category': r['category'],
                        'regressions': '; '.join(issues), 'stages_affected': len(issues)})
    reg.sort(key=lambda x: x['searches'], reverse=True)
    res['3.14'] = {
        'terms': reg[:30], 'count': len(reg),
        'insight': f"These {len(reg)} terms experienced funnel regression this period. Act immediately on high-volume terms in this list."
    }

    # ── 3.15 Stopped Converting ───────────────────────────────────────────────
    prev_orders = df_prev[df_prev['orders'] > 0][['term_norm','orders','searches']].rename(
        columns={'orders':'prev_orders','searches':'prev_searches'})
    stopped = pd.merge(df[df['orders'] == 0][['term_norm','searches']], prev_orders, on='term_norm')
    res['3.15'] = {
        'terms': stopped.sort_values('prev_orders', ascending=False).head(20).to_dict(orient='records'),
        'count': int(len(stopped)),
        'insight': f"{len(stopped)} terms were converting last period and stopped. Investigate catalog changes, price changes, or OOS."
    }

    # ── 3.16 Newly Converting ─────────────────────────────────────────────────
    prev_zero = df_prev[df_prev['orders'] == 0][['term_norm']]
    curr_conv = df[df['orders'] > 0][['term_norm','searches','orders','usd_revenue']]
    newly = pd.merge(curr_conv, prev_zero, on='term_norm')
    res['3.16'] = {
        'terms': newly.sort_values('usd_revenue', ascending=False).head(20).to_dict(orient='records'),
        'count': int(len(newly)),
        'insight': f"{len(newly)} terms unlocked revenue for the first time. Analyze what changed — new product, search improvement, or marketing."
    }

    # ── 3.17 Category Funnel Improvement ─────────────────────────────────────
    dp['e2e_conv'] = (dp['orders'] / dp['searches'].replace(0, np.nan)).fillna(0)
    curr_ce = df.groupby('category')['e2e_conv'].mean().reset_index().rename(columns={'e2e_conv':'curr_e2e'})
    prev_ce = dp.groupby('category')['e2e_conv'].mean().reset_index().rename(columns={'e2e_conv':'prev_e2e'})
    ci = pd.merge(curr_ce, prev_ce, on='category', how='outer').fillna(0)
    ci['delta'] = ((ci['curr_e2e'] - ci['prev_e2e']) / (ci['prev_e2e'] + 0.0001) * 100).round(1)
    ci = ci.sort_values('delta', ascending=False)
    top_ci = ci.iloc[0].to_dict() if len(ci) > 0 else None
    res['3.17'] = {
        'chart': ci.to_dict(orient='records'),
        'insight': (f"'{top_ci['category']}' showed the most funnel improvement — conversion rate up {top_ci['delta']:.1f}%. "
                   f"Study what drove this and replicate." if top_ci else '')
    }

    return res
