from dotenv import load_dotenv
load_dotenv()

import os
import io
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# Load SerpApi key from .env.local
load_dotenv(os.path.join(os.getcwd(), '.env.local'))

import layer12_logic
import layer4_trends_logic

app = Flask(__name__, static_folder='static')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB limit

from category_utils import get_category

def safe_read_csv(file_obj, filename):
    import io
    content = file_obj.read()
    
    # Debug hook: dump the raw file to disk
    try:
        with open('scratch/raw_' + filename.replace('.csv', '.txt'), 'wb') as dbg:
            dbg.write(content)
    except Exception as e:
        pass
    if not content:
        return pd.DataFrame()
    
    # Read manually to find the actual header row (skip comments/metadata)
    # We use io.BytesIO and decode line by line to detect the header
    header_idx = 0
    stream = io.BytesIO(content)
    
    # Try different encodings for header detection
    for encoding in ['utf-8', 'latin-1', 'cp1252']:
        try:
            stream.seek(0)
            text_stream = io.TextIOWrapper(stream, encoding=encoding, errors='ignore')
            for _ in range(50):
                line = text_stream.readline().strip().lower()
                # Look for characteristic GA4/Search Console headers
                if line.startswith('search term') or line.startswith('"search term"') or \
                   line.startswith('query') or line.startswith('"query"'):
                    break
                header_idx += 1
            else:
                # If loop finishes without break, reset header_idx for next encoding or default
                header_idx = 0
                continue
            break
        except Exception:
            header_idx = 0
            continue
            
    stream.seek(0)
    try:
        # Standard fast read
        df = pd.read_csv(stream, skiprows=header_idx, index_col=False)
    except Exception as e:
        app.logger.warning(f"Standard in-memory read failed for {filename}, trying robust read: {str(e)}")
        stream.seek(0)
        df = pd.read_csv(stream, sep=None, engine='python', on_bad_lines='skip', skiprows=header_idx, index_col=False)
        
    # Standardize column names (case insensitive)
    col_map = {
        'search term': 'query',
        'search_term': 'query',
        'query': 'query',
        'event count': 'a2c_count',
        'event_count': 'a2c_count'
    }
    df.rename(columns=lambda x: col_map.get(str(x).strip().strip('"').lower(), str(x).strip().strip('"')), inplace=True)
    
    # Handle the duplicate columns issue
    if 'a2c_count' in df.columns and isinstance(df['a2c_count'], pd.DataFrame):
        df['a2c_count'] = df['a2c_count'].iloc[:, 0]
    if 'orders' in df.columns and isinstance(df['orders'], pd.DataFrame):
        df['orders'] = df['orders'].iloc[:, 0]
        
    return df

def clean_and_normalize(df, term_col):
    if df is None or df.empty or term_col not in df.columns:
        return pd.DataFrame(columns=[term_col, 'term_norm'])
    # Skip metadata rows where term is null or contains "total"
    df = df.dropna(subset=[term_col])
    
    # User Fix 1: Skip grand total rows, empty, null
    df = df[~df[term_col].astype(str).str.strip().isin(['', 'null', 'Grand total', 'total'])]
    
    # Normalize: lowercase and strip
    df['term_norm'] = df[term_col].astype(str).str.lower().str.strip()
    return df

def aggregate_duplicates(df, numeric_cols):
    # Sum numeric values for the same normalized term
    agg_dict = {col: 'sum' for col in numeric_cols if col in df.columns}
    if not agg_dict: return df
    # Keep the original term_norm as index
    return df.groupby('term_norm').agg(agg_dict).reset_index()

def process_period_files(search_df, a2c_df):
    if search_df is None or search_df.empty:
        return pd.DataFrame()
        
    search_df = clean_and_normalize(search_df, 'query')
    search_num_cols = ['searches', 'search_visits', 'orders', 'usd_revenue', 'usd_revenue_per_search', 'usd_revenue_per_search_visit', 'usd_revenue_per_order', 'items_per_order', 'order_conversion']
    search_df = aggregate_duplicates(search_df, search_num_cols)
    
    if a2c_df is not None and not a2c_df.empty:
        # User defined A2C processing
        if 'search_term' in a2c_df.columns:
            a2c_df = a2c_df[a2c_df['search_term'].notna()]
            a2c_df = a2c_df[~a2c_df['search_term'].astype(str).str.strip().isin(['', 'null', 'Grand total', 'total'])]
            a2c_df['term_norm'] = a2c_df['search_term'].astype(str).str.lower().str.strip()
            
            # Make sure a2c_count is numeric so groupby sum works mathematically
            if 'a2c_count' in a2c_df.columns:
                if a2c_df['a2c_count'].dtype == object:
                    a2c_df['a2c_count'] = a2c_df['a2c_count'].apply(lambda x: pd.to_numeric(str(x).replace(',', ''), errors='coerce')).fillna(0)
                a2c_df = a2c_df.groupby('term_norm', as_index=False)['a2c_count'].sum()
            else:
                a2c_df = pd.DataFrame(columns=['term_norm', 'a2c_count'])
        else:
            # Fallback if A2C data used a different column like query
            if 'query' in a2c_df.columns:
                a2c_df['search_term'] = a2c_df['query']
                a2c_df = a2c_df[a2c_df['search_term'].notna()]
                a2c_df = a2c_df[~a2c_df['search_term'].astype(str).str.strip().isin(['', 'null', 'Grand total', 'total'])]
                a2c_df['term_norm'] = a2c_df['search_term'].astype(str).str.lower().str.strip()
                if 'a2c_count' in a2c_df.columns:
                    if a2c_df['a2c_count'].dtype == object:
                        a2c_df['a2c_count'] = a2c_df['a2c_count'].apply(lambda x: pd.to_numeric(str(x).replace(',', ''), errors='coerce')).fillna(0)
                    a2c_df = a2c_df.groupby('term_norm', as_index=False)['a2c_count'].sum()
                else:
                    a2c_df = pd.DataFrame(columns=['term_norm', 'a2c_count'])
            else:
                a2c_df = pd.DataFrame(columns=['term_norm', 'a2c_count'])
    else:
        a2c_df = pd.DataFrame(columns=['term_norm', 'a2c_count'])
        
    # Extra safety guard: ensure term_norm exists in all before merge
    if 'term_norm' not in search_df.columns: search_df['term_norm'] = []
    if 'term_norm' not in a2c_df.columns: a2c_df['term_norm'] = []
        
    # Join the two
    merged = pd.merge(search_df, a2c_df, on='term_norm', how='left')
    
    # Fill NAs
    merged.fillna(0, inplace=True)
    
    # Assign categories and long-tail check
    merged['category'] = merged['term_norm'].apply(get_category)
    merged['is_long_tail'] = merged['term_norm'].apply(lambda x: len(str(x).split()) >= 3)
    
    return merged

@app.route('/')
def index():
    return app.send_static_file('index.html')
    
@app.route('/<path:path>')
def static_proxy(path):
    return app.send_static_file(path)

@app.route('/upload', methods=['POST'])
def upload():
    files = request.files
    try:
        search_curr = safe_read_csv(files['search_terms_current'], 'search_terms_current.csv') if 'search_terms_current' in files else None
        a2c_curr = safe_read_csv(files['a2c_current'], 'a2c_current.csv') if 'a2c_current' in files else None
        
        search_prev = safe_read_csv(files['search_terms_previous'], 'search_terms_previous.csv') if 'search_terms_previous' in files else None
        a2c_prev = safe_read_csv(files['a2c_previous'], 'a2c_previous.csv') if 'a2c_previous' in files else None

        df_curr = process_period_files(search_curr, a2c_curr)
        df_prev = process_period_files(search_prev, a2c_prev)
        
        # Call the logic engines
        kpis   = layer12_logic.run_kpis(df_curr, df_prev)
        layer1 = layer12_logic.run_layer1(df_curr, df_prev)
        layer2 = layer12_logic.run_layer2(df_curr, df_prev)
        layer3 = layer12_logic.run_layer3(df_curr, df_prev)

        # Build minimal trends_inputs for Layer 4 (sent back to client)
        top_terms = df_curr.sort_values('searches', ascending=False).head(25)
        top_cats = df_curr.groupby('category')['searches'].sum().sort_values(ascending=False).head(5).index.tolist()
        zero_a2c = df_curr[(df_curr['a2c_count'] == 0) & (df_curr['search_visits'] >= 200)] \
            .sort_values('search_visits', ascending=False).head(30)
        zero_conv = df_curr[(df_curr['orders'] == 0) & (df_curr['searches'] >= 1000)] \
            .sort_values('searches', ascending=False).head(25)

        trends_inputs = {
            'top_terms':       top_terms[['term_norm','searches','a2c_count','orders','category']].to_dict(orient='records'),
            'top_categories':  top_cats,
            'zero_a2c_terms':  zero_a2c[['term_norm','searches','search_visits']].to_dict(orient='records'),
            'zero_conv_terms': zero_conv[['term_norm','searches','category']].to_dict(orient='records'),
        }

        response_data = {
            "status": "success",
            "current_terms_processed": len(df_curr),
            "previous_terms_processed": len(df_prev),
            "summary": kpis,
            "layer1": layer1,
            "layer2": layer2,
            "layer3": layer3,
            "trends_inputs": trends_inputs
        }

        return jsonify(response_data)
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/trends_layer4', methods=['POST'])
def trends_layer4():
    if not os.environ.get("SERPAPI_KEY"):
        return jsonify({'status': 'error', 'message': 'SERPAPI_KEY not configured'}), 500
        
    body = request.json or {}
    top_terms      = body.get('top_terms', [])
    top_categories = body.get('top_categories', [])
    zero_a2c_terms = body.get('zero_a2c_terms', [])
    zero_conv_terms= body.get('zero_conv_terms', [])
    try:
        result = layer4_trends_logic.run_layer4_trends(
            top_terms, top_categories, zero_a2c_terms, zero_conv_terms
        )
        return jsonify({'status': 'success', 'layer4': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/trends', methods=['POST'])
def api_trends():
    """Endpoint 1: /api/trends (POST) — interest over time"""
    if not os.environ.get("SERPAPI_KEY"):
        return jsonify({'status': 'error', 'message': 'SERPAPI_KEY not configured'}), 500
        
    body = request.json or {}
    keywords = body.get('keywords', [])[:5]  # Limit to 5
    geo = body.get('geo', 'IN')
    timeframe = body.get('timeframe', 'today 3-m')
    
    import requests
    results = {}
    for kw in keywords:
        params = {
            "engine": "google_trends",
            "q": kw,
            "geo": geo,
            "date": timeframe,
            "api_key": os.environ.get("SERPAPI_KEY")
        }
        try:
            r = requests.get("https://serpapi.com/search", params=params, timeout=20)
            if r.status_code != 200:
                return jsonify({'status': 'error', 'message': 'SerpApi request failed', 'details': r.text}), 502
            
            data = r.json().get("interest_over_time", {}).get("timeline_data", [])
            results[kw] = data
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
            
    return jsonify({"data": results, "status": "ok"})

@app.route('/api/trends/rising', methods=['POST'])
def api_trends_rising():
    """Endpoint 2: /api/trends/rising (POST) — rising related queries"""
    if not os.environ.get("SERPAPI_KEY"):
        return jsonify({'status': 'error', 'message': 'SERPAPI_KEY not configured'}), 500
        
    body = request.json or {}
    keywords = body.get('keywords', [])[:5]
    
    import requests
    results = {}
    for kw in keywords:
        params = {
            "engine": "google_trends",
            "q": kw,
            "data_type": "RELATED_QUERIES",
            "api_key": os.environ.get("SERPAPI_KEY")
        }
        try:
            r = requests.get("https://serpapi.com/search", params=params, timeout=20)
            if r.status_code != 200:
                return jsonify({'status': 'error', 'message': 'SerpApi request failed', 'details': r.text}), 502
            
            rising = r.json().get("related_queries", {}).get("rising", [])
            results[kw] = rising
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
            
    return jsonify({"data": results, "status": "ok"})

@app.route('/trends_test', methods=['GET'])
def trends_test():
    """Quick connectivity check — one SerpApi call with 'gold' to verify reachability."""
    if not os.environ.get("SERPAPI_KEY"):
        return jsonify({'status': 'error', 'message': 'SERPAPI_KEY not configured'}), 500
        
    try:
        import requests
        params = {
            "engine": "google_trends",
            "q": "gold",
            "geo": "IN",
            "date": "today 1-m",
            "api_key": os.environ.get("SERPAPI_KEY")
        }
        r = requests.get("https://serpapi.com/search", params=params, timeout=20)
        if r.status_code != 200:
            return jsonify({'status': 'error', 'message': 'SerpApi reachable but returned error', 'details': r.text}), 502
            
        data = r.json().get("interest_over_time", {}).get("timeline_data", [])
        return jsonify({'status': 'ok', 'points': len(data), 'message': f'SerpApi reachable. {len(data)} points for "gold".'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/trends', methods=['POST'])
def trends():
    """Deprecated legacy endpoint, redirected to new SerpApi logic if needed."""
    return api_trends()

import db as supabase_db
import math

# ── Admin page route ──────────────────────────────────────────────────
@app.route('/admin')
def admin_page():
    return app.send_static_file('admin.html')

# ── Admin: upload a week ──────────────────────────────────────────────
@app.route('/admin/upload-week', methods=['POST'])
def admin_upload_week():
    # Password check
    if request.form.get('password') != os.environ.get('ADMIN_PASSWORD'):
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401

    label            = request.form.get('label', '').strip()
    week_start_date  = request.form.get('week_start_date') or None
    if not label:
        return jsonify({'status': 'error', 'message': 'Week label required'}), 400

    files = request.files
    try:
        search_curr = safe_read_csv(
            files['search_terms'], 'search_terms.csv'
        ) if 'search_terms' in files else None
        a2c_curr = safe_read_csv(
            files['a2c'], 'a2c.csv'
        ) if 'a2c' in files else None

        df = process_period_files(search_curr, a2c_curr)
        if df is None or df.empty:
            return jsonify({'status': 'error',
                            'message': 'No data processed from files'}), 400

        # Compute rates (same logic as run_layer3)
        import numpy as np
        df['visit_rate']    = (df['search_visits'] /
                               df['searches'].replace(0, np.nan)).fillna(0).round(4)
        df['a2c_rate_s']    = (df['a2c_count'] /
                               df['searches'].replace(0, np.nan)).fillna(0).round(4)
        df['purchase_rate'] = (df['orders'] /
                               df['a2c_count'].replace(0, np.nan)).fillna(0).round(4)
        df['e2e_conv']      = (df['orders'] /
                               df['searches'].replace(0, np.nan)).fillna(0).round(6)

        client = supabase_db.get_client()

        # Insert week record first → get the week_id
        week_row = client.table('weeks').insert({
            'label':           label,
            'week_start_date': week_start_date,
            'total_terms':     int(len(df)),
            'total_searches':  int(df['searches'].sum()),
            'total_orders':    int(df['orders'].sum()),
        }).execute()

        week_id = week_row.data[0]['id']

        # Build records for bulk insert
        records = []
        for _, row in df.iterrows():
            records.append({
                'week_id':      week_id,
                'term_norm':    str(row['term_norm']),
                'category':     str(row.get('category', '')),
                'searches':     int(row.get('searches', 0)),
                'search_visits':int(row.get('search_visits', 0)),
                'a2c_count':    int(row.get('a2c_count', 0)),
                'orders':       int(row.get('orders', 0)),
                'usd_revenue':  float(row.get('usd_revenue', 0)),
                'visit_rate':   float(row.get('visit_rate', 0)),
                'a2c_rate_s':   float(row.get('a2c_rate_s', 0)),
                'purchase_rate':float(row.get('purchase_rate', 0)),
                'e2e_conv':     float(row.get('e2e_conv', 0)),
                'is_long_tail': bool(row.get('is_long_tail', False)),
            })

        # Bulk insert in chunks of 500 (Supabase payload limit)
        CHUNK = 500
        for i in range(0, len(records), CHUNK):
            client.table('search_terms_weekly').insert(
                records[i:i + CHUNK]
            ).execute()

        return jsonify({
            'status':   'success',
            'week_id':  week_id,
            'label':    label,
            'terms_uploaded': len(records),
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


# ── Parallel helper for paginated fetching ────────────────────────────
def fetch_weekly_data_parallel(client, week_ids, select_cols):
    from concurrent.futures import ThreadPoolExecutor
    if not week_ids:
        return []
    # Get total_terms for each week from metadata to paginate accurately
    weeks_meta = client.table('weeks') \
                       .select('id, total_terms') \
                       .in_('id', week_ids) \
                       .execute().data
    week_limits = {w['id']: w['total_terms'] for w in weeks_meta}

    def fetch_page(week_id, start):
        return client.table('search_terms_weekly') \
                     .select(select_cols) \
                     .eq('week_id', week_id) \
                     .range(start, start + 999) \
                     .execute().data

    futures = []
    with ThreadPoolExecutor(max_workers=20) as executor:
        for week_id in week_ids:
            total = week_limits.get(week_id, 25000)
            for start in range(0, total, 1000):
                futures.append(executor.submit(fetch_page, week_id, start))

    records = []
    for f in futures:
        records.extend(f.result())
    return records


# ── Get all uploaded weeks ────────────────────────────────────────────
@app.route('/weeks', methods=['GET'])
def get_weeks():
    try:
        client = supabase_db.get_client()
        result = client.table('weeks') \
                       .select('*') \
                       .order('week_start_date', desc=False) \
                       .execute()
        return jsonify({'status': 'success', 'weeks': result.data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/trends-weekly', methods=['POST'])
def trends_weekly():
    body     = request.json or {}
    week_ids = body.get('week_ids', [])    # list of int week IDs
    top_n    = int(body.get('top_n', 50))  # 10, 25, or 50
    terms    = body.get('terms', None)     # list of specific term_norms (optional)

    if not week_ids:
        return jsonify({'status': 'error',
                        'message': 'week_ids required'}), 400
    try:
        client = supabase_db.get_client()

        if terms:
            # Query only specific terms directly, bypassing parallel full table fetch
            records = client.table('search_terms_weekly') \
                            .select('week_id,term_norm,category,searches,visit_rate,a2c_rate_s,purchase_rate,e2e_conv') \
                            .in_('week_id', week_ids) \
                            .in_('term_norm', terms) \
                            .execute().data
            top_terms = terms
        else:
            # Fetch all term data in parallel using the paginated helper
            records = fetch_weekly_data_parallel(
                client, week_ids,
                'week_id,term_norm,category,searches,visit_rate,a2c_rate_s,purchase_rate,e2e_conv'
            )

        import pandas as pd
        import numpy as np

        df = pd.DataFrame(records)
        
        if not terms:
            if df.empty:
                return jsonify({'status': 'success', 'terms': [],
                                'weeks': []})

            # Determine top N terms by total searches across all
            # selected weeks — this is the stable ranking
            top_terms = (
                df.groupby('term_norm')['searches']
                .sum()
                .sort_values(ascending=False)
                .head(top_n)
                .index
                .tolist()
            )

            # Filter to only top N terms
            df = df[df['term_norm'].isin(top_terms)]

        # Pivot: one row per term, one column group per week
        # Shape the response as a list of term objects, each with
        # a 'weeks' list ordered by week_start_date
        weeks_meta = client.table('weeks') \
                           .select('id, label, week_start_date') \
                           .in_('id', week_ids) \
                           .order('week_start_date', desc=False) \
                           .execute().data

        week_order = [w['id'] for w in weeks_meta]

        terms_out = []
        for term in top_terms:
            sub = df[df['term_norm'] == term] if not df.empty else pd.DataFrame()
            weekly = []
            for wid in week_order:
                row = sub[sub['week_id'] == wid] if not sub.empty else pd.DataFrame()
                if row.empty:
                    weekly.append(None)  # term not present this week
                else:
                    r = row.iloc[0]
                    weekly.append({
                        'week_id':      wid,
                        'searches':     int(r['searches']),
                        'visit_rate':   round(float(r['visit_rate']), 4),
                        'a2c_rate_s':   round(float(r['a2c_rate_s']), 4),
                        'purchase_rate':round(float(r['purchase_rate']), 4),
                        'e2e_conv':     round(float(r['e2e_conv']), 6),
                        'category':     str(r['category']),
                    })
            
            cat = str(sub.iloc[0]['category']) if (not sub.empty and 'category' in sub.columns) else ""
            terms_out.append({
                'term_norm': term,
                'category':  cat,
                'weeks':     weekly,
            })

        return jsonify({
            'status':      'success',
            'weeks_meta':  weeks_meta,
            'terms':       terms_out,
            'top_n':       top_n if not terms else len(terms),
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


# ── Admin: delete a week ──────────────────────────────────────────────
@app.route('/admin/delete-week/<int:week_id>', methods=['DELETE'])
def admin_delete_week(week_id):
    if request.json.get('password') != os.environ.get('ADMIN_PASSWORD'):
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    try:
        client = supabase_db.get_client()
        # ON DELETE CASCADE handles search_terms_weekly cleanup
        client.table('weeks').delete().eq('id', week_id).execute()
        return jsonify({'status': 'success', 'deleted_week_id': week_id})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

# ── GET /terms-list ──────────────────────────────────────────────────
@app.route('/terms-list', methods=['GET'])
def terms_list():
    try:
        client = supabase_db.get_client()
        weeks_res = client.table('weeks').select('id, total_terms').execute().data
        if not weeks_res:
            return jsonify({'status': 'success', 'terms': []})

        from concurrent.futures import ThreadPoolExecutor
        def fetch_page(week_id, start):
            return client.table('search_terms_weekly') \
                         .select('term_norm') \
                         .eq('week_id', week_id) \
                         .range(start, start + 999) \
                         .execute().data

        futures = []
        with ThreadPoolExecutor(max_workers=20) as executor:
            for w in weeks_res:
                week_id = w['id']
                total = w.get('total_terms', 25000)
                for start in range(0, total, 1000):
                    futures.append(executor.submit(fetch_page, week_id, start))

        terms = set()
        for f in futures:
            for r in f.result():
                tn = r.get('term_norm')
                if tn:
                    terms.add(tn)

        return jsonify({'status': 'success', 'terms': sorted(list(terms))})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

# ── POST /trends-material ─────────────────────────────────────────────
METALS    = {
    'Gold': 'gold', 'Diamond': 'diamond', 'Silver': 'silver',
    'Platinum': 'platinum', 'Rose Gold': 'rose gold',
    'White Gold': 'white gold',
}
GEMSTONES = {
    'Ruby': 'ruby', 'Emerald': 'emerald', 'Sapphire': 'sapphire',
    'Pearl': 'pearl', 'Polki': 'polki', 'Kundan': 'kundan',
    'Tanzanite': 'tanzanite', 'Coral': 'coral', 'Opal': 'opal',
}

@app.route('/trends-material', methods=['POST'])
def trends_material():
    body     = request.json or {}
    week_ids = body.get('week_ids', [])
    if not week_ids:
        return jsonify({'status':'error',
                        'message':'week_ids required'}), 400
    try:
        import pandas as pd
        client = supabase_db.get_client()

        # Fetch ALL term data for these weeks in parallel (no top-N limit)
        records = fetch_weekly_data_parallel(
            client, week_ids,
            'week_id,term_norm,category,searches'
        )
        df = pd.DataFrame(records)
        if df.empty:
            return jsonify({
                'status':     'success',
                'weeks_meta': [],
                'metals':     {n: [] for n in METALS},
                'gemstones':  {n: [] for n in GEMSTONES},
                'categories': {},
            })

        weeks_meta = client.table('weeks') \
                           .select('id,label,week_start_date') \
                           .in_('id', week_ids) \
                           .order('week_start_date', desc=False) \
                           .execute().data
        week_order = [w['id'] for w in weeks_meta]

        def agg_keyword(keyword):
            mask = df['term_norm'].str.contains(
                keyword, case=False, na=False
            )
            per_week = df[mask].groupby('week_id')['searches'] \
                               .sum().to_dict()
            return [
                {'week_id': wid,
                 'searches': int(per_week.get(wid, 0))}
                for wid in week_order
            ]

        metals_out    = {n: agg_keyword(kw)
                         for n, kw in METALS.items()}
        gemstones_out = {n: agg_keyword(kw)
                         for n, kw in GEMSTONES.items()}

        # Categories: aggregate from the category column directly
        cats_out = {}
        for cat, grp in df.groupby('category'):
            per_week = grp.groupby('week_id')['searches'] \
                          .sum().to_dict()
            cats_out[str(cat)] = [
                {'week_id': wid,
                 'searches': int(per_week.get(wid, 0))}
                for wid in week_order
            ]

        return jsonify({
            'status':     'success',
            'weeks_meta': weeks_meta,
            'metals':     metals_out,
            'gemstones':  gemstones_out,
            'categories': cats_out,
        })
    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 400

if __name__ == '__main__':
    app.run(port=5001, debug=True)

