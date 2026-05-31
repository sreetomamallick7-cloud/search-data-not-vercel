import re

def get_category(term):
    """
    Standard categorization logic for jewellery terms.
    Used across the app to group search terms and trends.
    """
    term = str(term).lower()
    
    # Precise matches first
    if any(k in term for k in ['coin', 'biscuit', 'bar', 'bullion']): return 'Coins & Bullion'
    if any(k in term for k in ['nose pin', 'nose ring', 'nosepin', 'nath']): return 'Nose Jewelry'
    
    # Earrings check (including spaced variants to prevent them matching the Rings regex check)
    if any(k in term for k in ['earring', 'earrings', 'earing', 'earings', 'ear ring', 'ear rings', 'jhumka', 'jhumkas', 'studs', 'tops', 'bali', 'hoop']): return 'Earrings'

    # Use regex for rings to avoid matching "earring"
    if re.search(r'\b(ring|rings)\b', term) or any(k in term for k in ['solitaire', 'band ring']): return 'Rings'
    
    if any(k in term for k in ['chain', 'chains']): return 'Chains'
    if any(k in term for k in ['necklace', 'necklaces', 'haar', 'haram', 'rani haar', 'choker']): return 'Necklaces'
    if any(k in term for k in ['mangalsutra', 'mangal']): return 'Mangalsutra'
    if any(k in term for k in ['bracelet', 'bracelets', 'bangle', 'bangles', 'kada', 'kangan']): return 'Bracelets & Bangles'
    if any(k in term for k in ['pendant', 'locket', 'pendent']): return 'Pendants'
    if any(k in term for k in ['anklet', 'payal']): return 'Anklets'
    
    # General material/type matches
    if 'diamond' in term: return 'Diamond'
    if 'gold' in term: return 'Gold Generic'
    if 'silver' in term: return 'Silver Generic'
    
    # Default category renamed as per requirement
    return 'General Jewellery'
