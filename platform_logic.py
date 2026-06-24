import csv
import io
import pandas as pd
import numpy as np

def parse_platform_csv(file_storage):
    """
    Parses the App/Web platform split CSV.
    Input: a Flask FileStorage object (from request.files[...])
    Output: DataFrame with columns:
      term_norm, web_searches, android_searches, ios_searches,
      app_searches, total_searches
    Raises ValueError with a clear message if the file doesn't
    match the expected shape.
    """
    content = file_storage.read()
    if isinstance(content, bytes):
        content = content.decode('utf-8', errors='replace')

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    header_idx = None
    for i, row in enumerate(rows):
        if row and str(row[0]).strip().lower() == 'platform':
            header_idx = i
            break
    if header_idx is None:
        raise ValueError(
            "Could not find the platform data header row. "
            "Expected a row starting with 'Platform' followed by "
            "web, Android, iOS, Totals columns."
        )

    data_rows = []
    for row in rows[header_idx + 1:]:
        if len(row) < 4:
            continue
        term = str(row[0]).strip()
        if not term:
            continue  # drops both blank-term aggregate/total rows
        try:
            web     = float(row[1])
            android = float(row[2])
            ios     = float(row[3])
        except (ValueError, IndexError):
            continue  # drops the "Search term, Event count" units row
        data_rows.append({
            'term': term, 'web': web,
            'android': android, 'ios': ios,
        })

    if not data_rows:
        raise ValueError(
            "No valid platform term rows found after the header. "
            "Check the file matches the expected export format."
        )

    df = pd.DataFrame(data_rows)
    # Normalize casing/whitespace BEFORE grouping — this is what
    # merges "gold coin" / "Gold Coin" / "gold coin " into one row
    df['term_norm'] = df['term'].str.lower().str.strip()

    grouped = df.groupby('term_norm', as_index=False).agg(
        web_searches=('web', 'sum'),
        android_searches=('android', 'sum'),
        ios_searches=('ios', 'sum'),
    )
    grouped['app_searches']   = (grouped['android_searches'] +
                                  grouped['ios_searches'])
    grouped['total_searches'] = (grouped['web_searches'] +
                                  grouped['app_searches'])
    grouped = grouped[grouped['total_searches'] > 0] \
                     .reset_index(drop=True)

    return grouped

MIN_VOLUME = 100
# Floor below which a term's platform split is too noisy to
# surface as a signal. Tune if needed — single constant, no
# logic changes required elsewhere.

def run_platform_analysis(
    df_curr, platform_curr,
    df_prev=None, platform_prev=None,
    zero_conv_terms=None, zero_cart_terms=None,
    breakout_terms=None, degrader_terms=None,
    category_funnel=None, occasion_clusters=None,
):
    """
    df_curr / df_prev: Main dataframes (already have term_norm,
      visit_rate, a2c_rate_s, purchase_rate, category, searches)
    platform_curr / platform_prev: output of parse_platform_csv
    zero_conv_terms:   layer3['3.8']            — list of dicts
    zero_cart_terms:   layer1['1.5']['zero_cart_terms']
    breakout_terms:    layer1['1.13']
    degrader_terms:    layer3['3.11']['degraders']
    category_funnel:   layer3['3.5']
    occasion_clusters: layer1['1.6']['occasion_clusters'] +
                        layer1['1.6']['use_case_clusters'] combined
    All cross-ref args are OPTIONAL — module still works with
    none of them, just skips Part B / parts of Part C.
    Returns None if platform_curr is empty/None.
    """
    if platform_curr is None or platform_curr.empty:
        return None

    from category_utils import get_category
    platform_curr = platform_curr.copy()
    platform_curr['category'] = platform_curr['term_norm'].apply(
        get_category
    )

    # ── Site-wide weighted averages (dynamic, never hardcoded) ──
    total_app = float(platform_curr['app_searches'].sum())
    total_all = float(platform_curr['total_searches'].sum())
    avg_app_share = total_app / max(total_all, 1)

    total_android = float(platform_curr['android_searches'].sum())
    avg_android_share_of_app = total_android / max(total_app, 1)

    platform_curr['app_share'] = (
        platform_curr['app_searches'] /
        platform_curr['total_searches'].replace(0, np.nan)
    )
    platform_curr['android_share_of_app'] = (
        platform_curr['android_searches'] /
        platform_curr['app_searches'].replace(0, np.nan)
    )
    # Platform Share Index: 100 = exactly average app concentration.
    # Same indexing device used in the Seasonality module — keeps
    # the mental model consistent across the dashboard.
    platform_curr['share_index'] = (
        platform_curr['app_share'] / max(avg_app_share, 0.0001) * 100
    ).round(0)

    # ── Cross-reference with Main's funnel rates (directional) ──
    main_cols = ['term_norm', 'searches', 'search_visits', 'a2c_count', 'orders']
    avail_cols = [c for c in main_cols if c in df_curr.columns]
    if 'term_norm' not in avail_cols:
        avail_cols.append('term_norm')
    
    main_rates = df_curr[avail_cols].drop_duplicates('term_norm').copy()

    if 'search_visits' in main_rates.columns and 'searches' in main_rates.columns:
        main_rates['visit_rate'] = (main_rates['search_visits'] / main_rates['searches'].replace(0, np.nan)).fillna(0)
    else:
        main_rates['visit_rate'] = np.nan

    if 'a2c_count' in main_rates.columns and 'searches' in main_rates.columns:
        main_rates['a2c_rate_s'] = (main_rates['a2c_count'] / main_rates['searches'].replace(0, np.nan)).fillna(0)
    else:
        main_rates['a2c_rate_s'] = np.nan

    if 'orders' in main_rates.columns and 'a2c_count' in main_rates.columns:
        main_rates['purchase_rate'] = (main_rates['orders'] / main_rates['a2c_count'].replace(0, np.nan)).fillna(0)
    else:
        main_rates['purchase_rate'] = np.nan

    merged = platform_curr.merge(main_rates, on='term_norm', how='left')

    significant = merged[merged['total_searches'] >= MIN_VOLUME].copy()

    # ── WoW App share shift (only if prev platform file given) ──
    share_shift_overall = None
    term_share_shift = {}
    if platform_prev is not None and not platform_prev.empty:
        total_app_prev = float(platform_prev['app_searches'].sum())
        total_all_prev = float(platform_prev['total_searches'].sum())
        avg_app_share_prev = total_app_prev / max(total_all_prev, 1)
        share_shift_overall = round(
            (avg_app_share - avg_app_share_prev) * 100, 1
        )  # in percentage points

        prev_lookup = platform_prev.set_index('term_norm')[
            ['app_searches', 'total_searches']
        ]
        for _, row in significant.iterrows():
            tn = row['term_norm']
            if tn in prev_lookup.index:
                prev_app   = prev_lookup.loc[tn, 'app_searches']
                prev_total = prev_lookup.loc[tn, 'total_searches']
                if prev_total > 0:
                    prev_share = prev_app / prev_total
                    term_share_shift[tn] = round(
                        (row['app_share'] - prev_share) * 100, 1
                    )

    def fmt_term(row):
        out = {
            'term':            row['term_norm'],
            'category':        row.get('category'),
            'web_searches':    int(row['web_searches']),
            'android_searches':int(row['android_searches']),
            'ios_searches':    int(row['ios_searches']),
            'app_searches':    int(row['app_searches']),
            'total_searches':  int(row['total_searches']),
            'app_share_pct':   round(row['app_share']*100, 1)
                                 if pd.notna(row['app_share']) else None,
            'share_index':     int(row['share_index'])
                                 if pd.notna(row['share_index']) else None,
            'android_share_of_app_pct':
                               round(row['android_share_of_app']*100, 1)
                                 if pd.notna(row['android_share_of_app'])
                                 else None,
            'visit_rate_pct':    round(row['visit_rate']*100, 1)
                                   if pd.notna(row.get('visit_rate'))
                                   else None,
            'a2c_rate_pct':      round(row['a2c_rate_s']*100, 1)
                                   if pd.notna(row.get('a2c_rate_s'))
                                   else None,
            'purchase_rate_pct': round(row['purchase_rate']*100, 1)
                                   if pd.notna(row.get('purchase_rate'))
                                   else None,
        }
        if row['term_norm'] in term_share_shift:
            out['app_share_shift_pp'] = term_share_shift[row['term_norm']]
        return out

    # ═══════════════════════════════════════════════════════════
    # PART A — What's happening on App (situational headline)
    # ═══════════════════════════════════════════════════════════
    app_dominant = significant.sort_values(
        'app_share', ascending=False
    ).head(20)
    web_dominant = significant.sort_values(
        'app_share', ascending=True
    ).head(20)

    has_app_vol = significant[
        significant['app_searches'] >= MIN_VOLUME
    ].copy()
    has_app_vol['os_deviation'] = (
        has_app_vol['android_share_of_app'] - avg_android_share_of_app
    ).abs()
    os_outliers = has_app_vol.sort_values(
        'os_deviation', ascending=False
    ).head(15)

    part_a = {
        'avg_app_share_pct': round(avg_app_share*100, 1),
        'avg_android_share_of_app_pct':
            round(avg_android_share_of_app*100, 1),
        'app_share_shift_pp':   share_shift_overall,
        'total_terms_analyzed': int(len(platform_curr)),
        'app_dominant_terms':
            [fmt_term(r) for _, r in app_dominant.iterrows()],
        'web_dominant_terms':
            [fmt_term(r) for _, r in web_dominant.iterrows()],
        'os_imbalance_outliers':
            [fmt_term(r) for _, r in os_outliers.iterrows()],
    }

    # ═══════════════════════════════════════════════════════════
    # PART B — Where App needs specific attention (diagnostic)
    # Cross-references EXISTING flagged lists — does not
    # recompute its own thresholds for any of these.
    # ═══════════════════════════════════════════════════════════
    def cross_ref(source_list):
        if not source_list:
            return []
        src_terms = {
            str(t.get('term_norm', '')).lower().strip()
            for t in source_list if t.get('term_norm')
        }
        matched = significant[
            significant['term_norm'].isin(src_terms)
        ].sort_values('app_share', ascending=False)
        return [fmt_term(r) for _, r in matched.iterrows()]

    part_b = {
        'zero_conv_app_skewed':
            cross_ref(zero_conv_terms),
        'zero_cart_app_skewed':
            cross_ref(zero_cart_terms),
        'breakout_app_origin':
            cross_ref(breakout_terms),
        'degraders_app_concentration':
            cross_ref(degrader_terms),
    }

    # ═══════════════════════════════════════════════════════════
    # PART C — Should we focus on App separately? (verdict)
    # ═══════════════════════════════════════════════════════════
    app_dom_rates = app_dominant['a2c_rate_s'].dropna()
    web_dom_rates = web_dominant['a2c_rate_s'].dropna()
    app_avg_conv = (round(app_dom_rates.mean()*100, 3)
                     if len(app_dom_rates) else None)
    web_avg_conv = (round(web_dom_rates.mean()*100, 3)
                     if len(web_dom_rates) else None)
    conv_gap_pp = (round(app_avg_conv - web_avg_conv, 3)
                    if (app_avg_conv is not None and
                        web_avg_conv is not None) else None)

    # Category rollup — reuses 3.5's already-computed funnel data
    category_rollup = []
    if category_funnel:
        cat_app_share = significant.groupby('category').apply(
            lambda g: g['app_searches'].sum() /
                      max(g['total_searches'].sum(), 1)
        ).to_dict()
        for c in category_funnel:
            cat_name = c.get('category')
            if cat_name in cat_app_share:
                category_rollup.append({
                    'category':      cat_name,
                    'app_share_pct': round(
                        cat_app_share[cat_name]*100, 1),
                    'searches':      c.get('searches'),
                    'e2e_conv_pct':  c.get('e2e_conv'),
                })
        category_rollup.sort(
            key=lambda x: x['app_share_pct'], reverse=True
        )

    # Occasion rollup — reuses 1.6's already-computed clusters
    occasion_rollup = []
    if occasion_clusters:
        term_app_share_map = dict(
            zip(significant['term_norm'], significant['app_share'])
        )
        for cluster in occasion_clusters:
            cluster_terms = [
                str(t.get('term_norm', '')).lower().strip()
                for t in cluster.get('terms', [])
            ]
            shares = [
                term_app_share_map[t] for t in cluster_terms
                if t in term_app_share_map
            ]
            if shares:
                occasion_rollup.append({
                    'cluster': cluster.get('cluster'),
                    'app_share_pct': round(
                        sum(shares)/len(shares)*100, 1),
                    'matched_terms': len(shares),
                })
        occasion_rollup.sort(
            key=lambda x: x['app_share_pct'], reverse=True
        )

    flagged_count = sum(len(v) for v in part_b.values())

    part_c = {
        'app_avg_conv_pct': app_avg_conv,
        'web_avg_conv_pct': web_avg_conv,
        'conv_gap_pp':      conv_gap_pp,
        'category_rollup':  category_rollup[:10],
        'occasion_rollup':  occasion_rollup[:10],
        'flagged_terms_count': flagged_count,
        'scorecard': {
            'app_share_pct':       round(avg_app_share*100, 1),
            'app_share_trend_pp':  share_shift_overall,
            'conv_gap_pp':         conv_gap_pp,
            'flagged_terms_count': flagged_count,
        },
    }

    return {
        'note': (
            'Top-N export — not exhaustive of all search volume. '
            'Conversion rates shown are cross-referenced from the '
            'Main dataset and are directional only, since App/Web '
            'data comes from a different source than Main.'
        ),
        'part_a': part_a,
        'part_b': part_b,
        'part_c': part_c,
    }
