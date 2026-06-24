import pandas as pd
import numpy as np
from category_utils import get_category, OCCASION_CLUSTERS, USE_CASE_CLUSTERS

# ─── Helpers ───────────────────────────────────────────────────────────────────

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
    def _build_cluster_rows(df, cluster_dict, tier, df_prev=None):
        """
        For each cluster in cluster_dict, aggregate all matching terms
        from df and return a list of cluster summary dicts.
        Matching is substring: any keyword appearing anywhere in term_norm.
        A term can match multiple clusters (multi-cluster assignment).
        """
        rows = []
        for cluster_name, keywords in cluster_dict.items():

            def _match_term(t):
                t_str = str(t).lower()
                if cluster_name == "Men's":
                    for bad in ['women', 'woman', 'engagement', 'ornament', 'consignment', 'shipment']:
                        if bad in t_str:
                            return False
                return any(k in t_str for k in keywords)

            mask = df['term_norm'].apply(_match_term)
            sub = df[mask].copy()
            if sub.empty:
                continue

            searches   = float(sub['searches'].sum())
            a2c_count  = float(sub['a2c_count'].sum())
            orders     = float(sub['orders'].sum())
            term_count = int(len(sub))
            conv_rate  = round(orders / max(searches, 1) * 100, 3)

            # ── Prev period ────────────────────────────────────────────
            prev_searches  = None
            prev_conv_rate = None
            searches_delta = None   # MoM % change in searches
            conv_delta     = None   # pp change in conversion rate

            if df_prev is not None and not df_prev.empty:
                prev_mask = df_prev['term_norm'].apply(_match_term)
                sub_prev = df_prev[prev_mask]
                if not sub_prev.empty:
                    prev_searches  = float(sub_prev['searches'].sum())
                    prev_orders    = float(sub_prev['orders'].sum())
                    prev_conv_rate = round(
                        prev_orders / max(prev_searches, 1) * 100, 3
                    )
                    searches_delta = round(
                        (searches - prev_searches) /
                        max(prev_searches, 1) * 100, 1
                    )
                    conv_delta = round(conv_rate - prev_conv_rate, 3)

            # ── Top terms for drill-down ───────────────────────────────
            top_terms = (
                sub.sort_values('searches', ascending=False)
                .head(15)
                [['term_norm', 'searches', 'a2c_count', 'orders']]
                .to_dict(orient='records')
            )

            rows.append({
                'cluster':        cluster_name,
                'tier':           tier,
                'searches':       searches,
                'a2c_count':      a2c_count,
                'orders':         orders,
                'term_count':     term_count,
                'conv_rate':      conv_rate,
                'prev_searches':  prev_searches,
                'prev_conv_rate': prev_conv_rate,
                'searches_delta': searches_delta,
                'conv_delta':     conv_delta,
                'terms':          top_terms,
            })

        rows.sort(key=lambda x: x['searches'], reverse=True)
        return rows

    res = {}
    if df_curr is None or df_curr.empty:
        return res

    df_curr = df_curr.copy()

    # Step A — Ensure these columns exist on df_curr before the top50 slice.
    df_curr['visit_rate']    = (df_curr['search_visits'] /
                                df_curr['searches'].replace(0, np.nan)
                               ).fillna(0).round(4)

    df_curr['a2c_rate_s']    = (df_curr['a2c_count'] /
                                df_curr['searches'].replace(0, np.nan)
                               ).fillna(0).round(4)

    df_curr['purchase_rate'] = np.where(
        df_curr['a2c_count'] > 0,
        (df_curr['orders'] / df_curr['a2c_count']).round(4),
        np.nan
    )

    total = df_curr['searches'].sum()

    # -- 1.1 Top 50 Terms -------------------------------------------------------
    # Step B — Compute WEIGHTED site-level averages from the FULL df_curr
    total_searches   = float(df_curr['searches'].sum())
    total_visits     = float(df_curr['search_visits'].sum())
    total_a2c        = float(df_curr['a2c_count'].sum())
    total_orders     = float(df_curr['orders'].sum())

    avg_visit_rate    = round(total_visits  / max(total_searches, 1), 4)
    avg_a2c_rate      = round(total_a2c     / max(total_searches, 1), 4)
    avg_purchase_rate = round(total_orders  / max(total_a2c, 1),      4)

    # Step C — Build res['1.1'] as a dict:
    top50 = df_curr.sort_values('searches', ascending=False).head(50).copy()

    # If prev period exists, merge in prev_searches and compute growth
    if df_prev is not None and not df_prev.empty:
        prev_cols = df_prev[['term_norm', 'searches']].rename(
            columns={'searches': 'prev_searches'})
        top50 = top50.merge(prev_cols, on='term_norm', how='left')
        top50['prev_searches']   = top50['prev_searches'].fillna(0)
        top50['searches_growth'] = (
            (top50['searches'] - top50['prev_searches']) /
            (top50['prev_searches'].replace(0, np.nan))
        ) * 100
    else:
        top50['prev_searches']   = None
        top50['searches_growth'] = None

    res['1.1'] = {
        'terms': top50[[
            'term_norm', 'category', 'searches', 'prev_searches',
            'searches_growth', 'a2c_count', 'orders',
            'visit_rate', 'a2c_rate_s', 'purchase_rate'
        ]].to_dict(orient='records'),

        'thresholds': {
            'visit_rate':    avg_visit_rate,
            'a2c_rate':      avg_a2c_rate,
            'purchase_rate': avg_purchase_rate,
        }
    }

    # NOTE: searches_growth may be None/NaN for terms with no prev data.
    # Convert NaN to None explicitly before serialisation:
    import math
    for row in res['1.1']['terms']:
        if row.get('searches_growth') is not None:
            if isinstance(row['searches_growth'], float) and math.isnan(row['searches_growth']):
                row['searches_growth'] = None
        if row.get('prev_searches') is not None:
            if isinstance(row['prev_searches'], float) and math.isnan(row['prev_searches']):
                row['prev_searches'] = None
        if row.get('purchase_rate') is not None:
            if isinstance(row['purchase_rate'], float) and math.isnan(row['purchase_rate']):
                row['purchase_rate'] = None

    # -- 1.2 Volume Concentration -----------------------------------------------
    sorted_df = df_curr.sort_values('searches', ascending=False).reset_index(drop=True)
    sorted_df['visit_rate'] = (sorted_df['search_visits'] / sorted_df['searches'].replace(0, np.nan)).fillna(0)
    t10  = float(sorted_df.iloc[:10]['searches'].sum())
    t50  = float(sorted_df.iloc[10:50]['searches'].sum())
    t100 = float(sorted_df.iloc[50:100]['searches'].sum())
    lt   = float(total - t10 - t50 - t100)
    top10_pct = _safe_pct(t10, total)
    top_term   = sorted_df.iloc[0]['term_norm'] if len(sorted_df) > 0 else ''
    top_term_s = float(sorted_df.iloc[0]['searches']) if len(sorted_df) > 0 else 0
    res['1.2'] = {
        'chart': [
            {'name': 'Top 10',     'value': t10,  'terms': sorted_df.iloc[:10][['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')},
            {'name': 'Top 11–50',  'value': t50,  'terms': sorted_df.iloc[10:50][['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')},
            {'name': 'Top 51–100', 'value': t100, 'terms': sorted_df.iloc[50:100][['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')},
            {'name': 'After 100 search key terms', 'value': max(0, lt), 'terms': sorted_df.iloc[100:][['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')},
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
    chart_13 = []
    for _, r in cat.iterrows():
        sub = df_curr[df_curr['category'] == r['category']].sort_values('searches', ascending=False).head(30).copy()
        sub['visit_rate'] = (sub['search_visits'] / sub['searches'].replace(0, np.nan)).fillna(0)
        chart_13.append({**r.to_dict(), 'terms': sub[['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')})
        
    res['1.3'] = {'chart': chart_13, 'insight': insight_13}

    # ── 1.5 Long-Tail Analysis ───────────────────────────────────────

    lt = df_curr[df_curr['is_long_tail'] == True].copy()
    total_searches_curr = float(df_curr['searches'].sum())

    lt_term_count      = int(len(lt))
    lt_searches_curr   = float(lt['searches'].sum())
    lt_pct_of_searches = round(
        lt_searches_curr / max(total_searches_curr, 1) * 100, 1
    )
    lt_pct_of_unique   = round(
        lt_term_count / max(len(df_curr), 1) * 100, 1
    )
    lt_avg_conv        = round(
        _safe_pct(lt['orders'].sum(), lt_searches_curr), 3
    )

    # ── Share shift (requires prev period) ──────────────────────────
    lt_share_shift = None
    lt_pct_prev    = None
    if df_prev is not None and not df_prev.empty:
        lt_prev             = df_prev[df_prev['is_long_tail'] == True]
        total_searches_prev = float(df_prev['searches'].sum())
        lt_searches_prev    = float(lt_prev['searches'].sum())
        lt_pct_prev         = round(
            lt_searches_prev / max(total_searches_prev, 1) * 100, 1
        )
        lt_share_shift = round(lt_pct_of_searches - lt_pct_prev, 1)
        # Positive = long-tail share growing (intent maturing)
        # Negative = long-tail share shrinking (more generic browsing)

    # ── Zero-cart terms: high intent, not converting ─────────────────
    # Threshold: long-tail terms with ≥200 searches and 0 add-to-cart.
    # 200 is a floor to exclude statistically insignificant terms.
    # visit_rate is included so the frontend can show WHERE the
    # funnel breaks (low visit = search not surfacing it;
    # ok visit + 0 a2c = catalog gap).
    zero_cart = lt[
        lt['a2c_count'] == 0
    ].copy()

    zero_cart['visit_rate'] = (
        zero_cart['search_visits'] /
        zero_cart['searches'].replace(0, np.nan)
    ).fillna(0).round(4)

    zero_cart_records = (
        zero_cart
        .sort_values('searches', ascending=False)
        .head(30)
        [['term_norm', 'category', 'searches', 'visit_rate']]
        .to_dict(orient='records')
    )

    # ── Top long-tail terms (reference list) ─────────────────────────
    top_lt = (
        lt.sort_values('searches', ascending=False)
        .head(30)
        [['term_norm', 'searches', 'a2c_count', 'orders', 'category']]
        .to_dict(orient='records')
    )

    # ── Insight ──────────────────────────────────────────────────────
    shift_text = ''
    if lt_share_shift is not None:
        direction = 'up' if lt_share_shift > 0 else 'down'
        shift_text = (
            f" Long-tail share of searches moved {direction} "
            f"{abs(lt_share_shift):.1f}pp MoM "
            f"({lt_pct_prev}% → {lt_pct_of_searches}%)."
        )
    zc_text = (
        f" {len(zero_cart)} long-tail terms with ≥200 searches have zero "
        f"add-to-cart — these are your highest-priority catalog or "
        f"relevance gaps." if len(zero_cart) > 0 else ''
    )

    res['1.5'] = {
        'term_count':          lt_term_count,
        'pct_of_unique_terms': lt_pct_of_unique,
        'pct_of_searches':     lt_pct_of_searches,
        'pct_of_searches_prev': lt_pct_prev,          # None if no prev
        'share_shift':         lt_share_shift,          # None if no prev
        'avg_conversion':      lt_avg_conv,
        'zero_cart_terms':     zero_cart_records,       # NEW
        'zero_cart_count':     int(len(zero_cart)),     # NEW
        'top_terms':           top_lt,
        'insight': (
            f"{lt_term_count} long-tail terms represent "
            f"{lt_pct_of_searches}% of total searches "
            f"with {lt_avg_conv:.3f}% average conversion."
            + shift_text + zc_text
        )
    }

    # ── 1.6 Intent Clusters ──────────────────────────────────────────

    occasion_rows  = _build_cluster_rows(
        df_curr, OCCASION_CLUSTERS,  'occasion',  df_prev
    )
    use_case_rows  = _build_cluster_rows(
        df_curr, USE_CASE_CLUSTERS,  'use_case',  df_prev
    )

    # Summary counts for insight
    total_intent_searches = float(
        df_curr['searches'].sum() if len(occasion_rows) + len(use_case_rows) > 0
        else 0
    )
    all_rows = occasion_rows + use_case_rows

    top_cluster    = all_rows[0] if all_rows else None
    zero_conv_clusters = [
        r for r in all_rows
        if r['orders'] == 0 and r['searches'] >= 500
    ]

    res['1.6'] = {
        'occasion_clusters':  occasion_rows,
        'use_case_clusters':  use_case_rows,
        'insight': (
            f"Found {len(occasion_rows)} occasion clusters and "
            f"{len(use_case_rows)} use-case clusters. "
            + (
                f"'{top_cluster['cluster']}' leads by volume with "
                f"{int(top_cluster['searches']):,} searches "
                f"({top_cluster['conv_rate']:.3f}% conversion). "
                if top_cluster else ''
            )
            + (
                f"{len(zero_conv_clusters)} cluster(s) have ≥500 searches "
                f"but zero orders — catalog or relevance gaps."
                if zero_conv_clusters else ''
            )
        )
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

    # -- 1.13 Breakout Detection ------------------------------------------------
    breakouts = merged[(merged['growth'] > 100) & (merged['prev_searches'] > 0)].sort_values('growth', ascending=False)
    b300 = breakouts[breakouts['searches'] >= 300]
    b100 = breakouts[(breakouts['searches'] >= 100) & (breakouts['searches'] < 300)]
    res['1.13'] = {
        'terms_300': b300[['term_norm','prev_searches','searches','growth','category','a2c_count','orders']].to_dict(orient='records'),
        'terms_100': b100[['term_norm','prev_searches','searches','growth','category','a2c_count','orders']].to_dict(orient='records'),
        'insight': f"{len(b300)} high-volume breakouts (≥300 searches) and {len(b100)} low-volume breakouts (100–299 searches) detected."
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

    cat_agg = df_curr.groupby('category').agg(
        unique_terms=('term_norm','count'),
        searches=('searches','sum'),
        a2c_count=('a2c_count','sum'),
        orders=('orders','sum'),
        revenue=('usd_revenue','sum')
    ).reset_index()


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
    lt_rows = []
    for _, r in lt_cat.iterrows():
        sub_lt = df_curr[(df_curr['category'] == r['category']) & (df_curr['is_long_tail'] == True)].sort_values('searches', ascending=False).head(30).copy()
        sub_lt['visit_rate'] = (sub_lt['search_visits'] / sub_lt['searches'].replace(0, np.nan)).fillna(0)
        sub_hd = df_curr[(df_curr['category'] == r['category']) & (df_curr['is_long_tail'] == False)].sort_values('searches', ascending=False).head(30).copy()
        sub_hd['visit_rate'] = (sub_hd['search_visits'] / sub_hd['searches'].replace(0, np.nan)).fillna(0)
        lt_rows.append({
            **r.to_dict(),
            'lt_terms': sub_lt[['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records'),
            'hd_terms': sub_hd[['term_norm','searches','a2c_count','orders','visit_rate']].to_dict(orient='records')
        })
    res['2.5'] = {
        'table': lt_rows,
        'insight': (f"'{top_lt['category']}' at {top_lt['lt_pct']:.1f}% long-tail = most specific buyer intent "
                    f"(mature demand — users know exactly what they want)." if top_lt is not None else '')
    }



    # ── 2.7 Men's Jewelry Intent ─────────────────────────────────────────────────
    men_mask = df_curr['term_norm'].apply(
        lambda t: any(k in t.lower() for k in MEN_KEYWORDS) and not any(w in t.lower() for w in ['women', 'womens', 'woman'])
    )
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
        p_searches = float(df_prev['searches'].sum())
        p_visits   = float(df_prev['search_visits'].sum()) if 'search_visits' in df_prev.columns else 0
        p_a2cs     = float(df_prev['a2c_count'].sum()) if 'a2c_count' in df_prev.columns else 0
        p_orders   = float(df_prev['orders'].sum()) if 'orders' in df_prev.columns else 0
        p_revenue  = float(df_prev['usd_revenue'].sum()) if 'usd_revenue' in df_prev.columns else 0

        p_a2c_rate = p_a2cs / p_searches if p_searches > 0 else 0
        p_e2e_conv = p_orders / p_searches if p_searches > 0 else 0
        p_rev_per_search = p_revenue / p_searches if p_searches > 0 else 0

        def calc_growth(curr, prev):
            if prev <= 0:
                return 0.0 if curr <= 0 else 100.0
            return round(((curr - prev) / prev) * 100, 2)

        kpis['searches_growth'] = calc_growth(searches, p_searches)
        kpis['a2c_rate_growth'] = calc_growth(kpis['a2c_rate'], p_a2c_rate)
        kpis['e2e_conv_growth'] = calc_growth(kpis['e2e_conv'], p_e2e_conv)
        kpis['orders_growth'] = calc_growth(orders, p_orders)
        kpis['revenue_growth'] = calc_growth(revenue, p_revenue)
        kpis['rev_per_search_growth'] = calc_growth(kpis['rev_per_search'], p_rev_per_search)
        
        p_ut = len(df_prev)
        kpis['unique_terms_growth'] = round(((len(df_curr) - p_ut) / (p_ut + 1)) * 100, 2)

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
    histogram = []
    for i in range(10):
        low = i / 10.0
        high = (i + 1) / 10.0
        # include upper bound for the last bin
        if i == 9:
            mask = (vr_clipped >= low) & (vr_clipped <= high)
        else:
            mask = (vr_clipped >= low) & (vr_clipped < high)
        sub = df[mask].sort_values('searches', ascending=False).head(30)
        histogram.append({
            'label': f"{i*10}–{(i+1)*10}%",
            'count': int(mask.sum()),
            'terms': sub[['term_norm','searches','a2c_count','orders','visit_rate','category']].to_dict(orient='records')
        })
    res['3.1'] = {
        'histogram': histogram,
        'bottom20': top100.sort_values('visit_rate').head(20)[
            ['term_norm','searches','search_visits','visit_rate','category']].to_dict(orient='records'),
        'avg_visit_rate': round(avg_vr, 4),
        'insight': (f"{low_vr_count} of the top 100 terms have <20% visit rate — highest priority for search relevance fix. "
                   f"Overall average visit rate: {avg_vr*100:.1f}%. Low visit rate means results are not relevant or compelling.")
    }



    # ── 3.5 Category Funnel Benchmarks ────────────────────────────────────────
    df_c = df_curr.copy()
    df_c['visit_rate'] = (df_c['search_visits'] / df_c['searches'].replace(0, np.nan)).fillna(0)
    df_c['a2c_rate_s'] = (df_c['a2c_count'] / df_c['searches'].replace(0, np.nan)).fillna(0)
    df_c['purchase_rate'] = (df_c['orders'] / df_c['a2c_count'].replace(0, np.nan)).fillna(0)
    df_c['e2e_conv']   = (df_c['orders'] / df_c['searches'].replace(0, np.nan)).fillna(0)
    
    cat_curr = df_c.groupby('category').agg(
        avg_visit_rate=('visit_rate','mean'),
        avg_a2c_rate=('a2c_rate_s','mean'),
        avg_purchase_rate=('purchase_rate','mean'),
        avg_e2e_conv=('e2e_conv','mean'),
        searches=('searches','sum')
    ).reset_index().fillna(0)
    
    if df_prev is not None and not df_prev.empty:
        df_p = df_prev.copy()
        df_p['visit_rate'] = (df_p['search_visits'] / df_p['searches'].replace(0, np.nan)).fillna(0)
        df_p['a2c_rate_s'] = (df_p['a2c_count'] / df_p['searches'].replace(0, np.nan)).fillna(0)
        df_p['purchase_rate'] = (df_p['orders'] / df_p['a2c_count'].replace(0, np.nan)).fillna(0)
        df_p['e2e_conv']   = (df_p['orders'] / df_p['searches'].replace(0, np.nan)).fillna(0)
        
        cat_prev = df_p.groupby('category').agg(
            avg_visit_rate_prev=('visit_rate','mean'),
            avg_a2c_rate_prev=('a2c_rate_s','mean'),
            avg_purchase_rate_prev=('purchase_rate','mean'),
            avg_e2e_conv_prev=('e2e_conv','mean')
        ).reset_index().fillna(0)
        
        cat_f = pd.merge(cat_curr, cat_prev, on='category', how='left').fillna(0)
        cat_f['delta_visit_rate'] = cat_f['avg_visit_rate'] - cat_f['avg_visit_rate_prev']
        cat_f['delta_a2c_rate']   = cat_f['avg_a2c_rate'] - cat_f['avg_a2c_rate_prev']
        cat_f['delta_e2e_conv']   = cat_f['avg_e2e_conv'] - cat_f['avg_e2e_conv_prev']
    else:
        cat_f = cat_curr.copy()
        cat_f['delta_visit_rate'] = 0.0
        cat_f['delta_a2c_rate']   = 0.0
        cat_f['delta_e2e_conv']   = 0.0
        
    best_cat  = cat_f.sort_values('avg_e2e_conv', ascending=False).iloc[0].to_dict() if len(cat_f) > 0 else None
    worst_cat = cat_f.sort_values('avg_e2e_conv').iloc[0].to_dict() if len(cat_f) > 0 else None
    
    cat_f_chart = []
    for _, r in cat_f.sort_values('searches', ascending=False).iterrows():
        sub = df[df['category'] == r['category']].sort_values('searches', ascending=False).head(100)
        cat_f_chart.append({
            **r.to_dict(), 
            'terms': sub[['term_norm','searches','visit_rate','a2c_rate_v','purchase_rate','e2e_conv','category','a2c_count','orders']].to_dict(orient='records')
        })
        
    res['3.5'] = {
        'categories': cat_f_chart,
        'insight': (f"'{best_cat['category']}' has the highest full-funnel efficiency "
                   f"(E2E {best_cat['avg_e2e_conv']*100:.3f}%). "
                   f"'{worst_cat['category']}' has the worst. Apply top-category merchandising patterns to underperformers."
                   if best_cat and worst_cat else '')
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
        'terms': df[['term_norm','searches','visit_rate','a2c_rate_v','purchase_rate','e2e_conv','funnel_stage','category','a2c_count','orders']].sort_values('searches', ascending=False).head(100).to_dict(orient='records'),
        'insight': (f"The most common failure is '{top_stage}' affecting {int((df['funnel_stage']==top_stage).sum())} terms. "
                   f"This points to a systemic {stage_desc.get(top_stage, '')} problem rather than individual term issues. "
                   f"(Thresholds: Stage 1 = <25% Visit Rate; Stage 2 = <5% A2C/Visit; Stage 3 = <1% Purch/A2C).")
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
    df_311 = merged[merged['searches'] >= 200]
    res['3.11'] = {
        'improvers': df_311.sort_values('vr_delta', ascending=False).head(15)[['term_norm','prev_vr','visit_rate','vr_delta','searches','category']].to_dict(orient='records'),
        'degraders': df_311.sort_values('vr_delta').head(15)[['term_norm','prev_vr','visit_rate','vr_delta','searches','category']].to_dict(orient='records'),
        'insight': "Visit rate improved → search relevance improved. Degraded → results may have changed or become less relevant."
    }

    # ── 3.12 A2C Rate Change ──────────────────────────────────────────────────
    merged['a2c_delta'] = (merged['a2c_rate_s'] - merged['prev_a2c_s']).round(4)
    df_312 = merged[merged['searches'] >= 200]
    res['3.12'] = {
        'improvers': df_312.sort_values('a2c_delta', ascending=False).head(15)[['term_norm','prev_a2c_s','a2c_rate_s','a2c_delta','searches','category']].to_dict(orient='records'),
        'degraders': df_312.sort_values('a2c_delta').head(15)[['term_norm','prev_a2c_s','a2c_rate_s','a2c_delta','searches','category']].to_dict(orient='records'),
        'insight': "A2C rate improving = growing product-market fit. Declining despite stable search = something changed on product/pricing."
    }

    # ── 3.13 A2C→Purchase Rate Change ────────────────────────────────────────
    merged['pr_delta'] = (merged['purchase_rate'] - merged['prev_pr']).round(4)
    res['3.13'] = {
        'improvers': merged.sort_values('pr_delta', ascending=False).head(15)[['term_norm','prev_pr','purchase_rate','pr_delta','a2c_count','category']].to_dict(orient='records'),
        'degraders': merged.sort_values('pr_delta').head(15)[['term_norm','prev_pr','purchase_rate','pr_delta','a2c_count','category']].to_dict(orient='records'),
        'insight': "Declining checkout rate = cart abandonment worsening. Causes: price increase, checkout friction, competitor availability."
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
