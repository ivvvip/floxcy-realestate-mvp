"""Seed logic for areas and market snapshots — importable from the running app.

This is the source of truth for the 70-area Dubai catalog.

`AREA_CATALOG` defines identity (name, arabic, type, geo, description).
`AREA_BASELINES` defines current Q1 2026 market metrics per area.

When `seed_snapshots_with_session` runs, it:
  1. UPSERTs every catalog entry into the `areas` table (idempotent by name).
  2. Wipes existing market_snapshots.
  3. Generates 12 monthly snapshots per area using procedural variation
     around the baseline.

Data calibrated to Q1 2026 from aggregated public sources (Bayut, ValuStrat,
Knight Frank, PropertyFinder, government records). See /methodology for the
full provenance.
"""
from __future__ import annotations

from datetime import date
from sqlalchemy import select, delete

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


DATA_SOURCE = "Aggregated public sources Q1 2026"


# ---------------------------------------------------------------------------
# AREA CATALOG — identity metadata for every tracked area
# ---------------------------------------------------------------------------
# Each entry: name → {arabic, type, lat, lng, description}

AREA_CATALOG: dict[str, dict] = {
    # ===== PREMIUM / LUXURY (15) =====
    "Downtown Dubai": {
        "arabic": "وسط مدينة دبي", "type": "mixed",
        "lat": 25.1972, "lng": 55.2744,
        "desc": "Dubai's central business and tourism core. Anchored by Burj Khalifa, Dubai Mall, and the Opera District. Highest tower density in the city; mix of branded residences, hotel-serviced apartments, and Grade A offices.",
    },
    "Palm Jumeirah": {
        "arabic": "نخلة جميرا", "type": "residential",
        "lat": 25.1124, "lng": 55.1390,
        "desc": "Iconic palm-shaped artificial archipelago. Beachfront villas, signature apartments, and ultra-luxury branded residences. Tourism-driven secondary rental demand props up yields despite high entry prices.",
    },
    "Dubai Marina": {
        "arabic": "دبي مارينا", "type": "mixed",
        "lat": 25.0805, "lng": 55.1403,
        "desc": "Man-made waterfront with the world's longest marina promenade. Dense residential towers, retail, restaurants. Most-traded community by volume; strong short-term rental market.",
    },
    "Business Bay": {
        "arabic": "الخليج التجاري", "type": "mixed",
        "lat": 25.1846, "lng": 55.2654,
        "desc": "Central business district along the Dubai Water Canal. Mix of Grade A offices, branded residences, and hotel apartments. Q1 2026 avg AED/sqft of ~2,900 makes it the highest-liquidity premium area.",
    },
    "Dubai Hills Estate": {
        "arabic": "دبي هيلز", "type": "residential",
        "lat": 25.1024, "lng": 55.2473,
        "desc": "Emaar's flagship integrated community around an 18-hole golf course. Villas, townhouses, and apartments with strong school catchment. Rental values posted Dubai's highest YoY growth (+33.8%) in 2026.",
    },
    "Emirates Hills": {
        "arabic": "تلال الإمارات", "type": "residential",
        "lat": 25.0697, "lng": 55.1644,
        "desc": "Dubai's most exclusive villa enclave — 215 detached luxury mansions overlooking The Montgomerie Golf Course. Ultra-luxury units cross 14,000 AED/sqft. Very low transaction velocity but exceptional capital preservation.",
    },
    "Bluewaters Island": {
        "arabic": "جزيرة بلوواترز", "type": "mixed",
        "lat": 25.0807, "lng": 55.1280,
        "desc": "Meraas master-planned island home to Ain Dubai. Boutique residential towers, retail, and hospitality. Limited supply and waterfront positioning command strong premiums.",
    },
    "DIFC": {
        "arabic": "مركز دبي المالي العالمي", "type": "commercial",
        "lat": 25.2110, "lng": 55.2807,
        "desc": "Dubai International Financial Centre — independent financial free zone with its own English-common-law legal system. Anchor for banks, asset managers, family offices. Residential supply is limited and premium.",
    },
    "Jumeirah Beach Residence": {
        "arabic": "شاطئ جميرا", "type": "residential",
        "lat": 25.0782, "lng": 55.1330,
        "desc": "Beachfront residential cluster of 40 high-rises along The Walk and The Beach. Strong vacation-rental income; tourist footfall keeps occupancy elevated year-round.",
    },
    "The Lakes": {
        "arabic": "البحيرات", "type": "residential",
        "lat": 25.0589, "lng": 55.1815,
        "desc": "Established Emaar villa community along man-made lakes. Family-oriented with low density; supply is essentially fixed. Steady appreciation, modest yields.",
    },
    "The Meadows": {
        "arabic": "المروج", "type": "residential",
        "lat": 25.0635, "lng": 55.1745,
        "desc": "Family-villa community adjacent to The Lakes and Emirates Hills. Mature landscaping and schools drive long-tenure tenants. Limited new supply supports stable values.",
    },
    "The Springs": {
        "arabic": "الينابيع", "type": "residential",
        "lat": 25.0509, "lng": 55.1875,
        "desc": "Entry-tier Emaar villas in the same master plan as Meadows/Lakes. Mid-size townhouse-style units. Consistent rental demand from young families.",
    },
    "Arabian Ranches": {
        "arabic": "المرابع العربية", "type": "residential",
        "lat": 25.0567, "lng": 55.2716,
        "desc": "Suburban villa community with golf course, schools, and equestrian centre. Multi-phase development with mature inner phases and newer outer extensions.",
    },
    "City Walk": {
        "arabic": "سيتي ووك", "type": "mixed",
        "lat": 25.2070, "lng": 55.2622,
        "desc": "Open-air retail-led mixed-use district by Meraas. Boutique residences above premium F&B and lifestyle retail. Strong short-stay rental performance.",
    },
    "La Mer": {
        "arabic": "لا مير", "type": "mixed",
        "lat": 25.2350, "lng": 55.2602,
        "desc": "Beachfront retail-led development along Jumeirah Bay. Mix of low-rise residential, F&B, and entertainment. Premium tourist-adjacent positioning.",
    },

    # ===== MID-RANGE RESIDENTIAL (20) =====
    "Jumeirah Village Circle": {
        "arabic": "قرية جميرا الدائرية", "type": "residential",
        "lat": 25.0612, "lng": 55.2087,
        "desc": "Dubai's highest-volume mid-range community. Apartments and townhouses with circular master plan. Reliable 7.5-9.5% gross yields; mid-income tenant base.",
    },
    "Arjan": {
        "arabic": "أرجان", "type": "residential",
        "lat": 25.0556, "lng": 55.2384,
        "desc": "Affordable apartment cluster near Miracle Garden and Dubai Studio City. Heavy off-plan supply pipeline; strong yields driven by low entry prices.",
    },
    "Dubai South": {
        "arabic": "دبي الجنوب", "type": "mixed",
        "lat": 24.8895, "lng": 55.1466,
        "desc": "Master-planned aerotropolis around Al Maktoum International. Long-horizon thesis tied to airport expansion and logistics. Currently affordable; emerging growth story.",
    },
    "Meydan": {
        "arabic": "ميدان", "type": "residential",
        "lat": 25.1610, "lng": 55.3000,
        "desc": "Mid-to-upper villa community around Meydan Racecourse. Strong inflows post-MBR City connectivity upgrades; healthy yield-growth balance.",
    },
    "Jumeirah Village Triangle": {
        "arabic": "مثلث قرية جميرا", "type": "residential",
        "lat": 25.0571, "lng": 55.2087,
        "desc": "Triangle-shaped sister of JVC, dominated by townhouses and lower-density apartments. Family-oriented; similar yield economics at slightly larger unit sizes.",
    },
    "Dubai Sports City": {
        "arabic": "مدينة دبي الرياضية", "type": "residential",
        "lat": 25.0405, "lng": 55.2173,
        "desc": "Sports-themed master community around academies and golf course. Affordable studios and 1-beds; gross yields 7-9% with studios occasionally clearing 9%+.",
    },
    "Dubai Studio City": {
        "arabic": "مدينة دبي للاستديوهات", "type": "residential",
        "lat": 25.0376, "lng": 55.2456,
        "desc": "Media-production-focused community adjacent to Arjan. Affordable mid-tier apartments with steady tenant demand from creative-industry workers.",
    },
    "Motor City": {
        "arabic": "موتور سيتي", "type": "residential",
        "lat": 25.0451, "lng": 55.2398,
        "desc": "Motorsports-themed community around Dubai Autodrome. Mixed apartment and townhouse stock; mid-market pricing.",
    },
    "Discovery Gardens": {
        "arabic": "حدائق ديسكفري", "type": "residential",
        "lat": 25.0444, "lng": 55.1408,
        "desc": "Dubai's most affordable established apartment cluster. Low entry prices (~AED 250-400k for studios) drive top-quartile yields and consistent occupancy.",
    },
    "The Greens": {
        "arabic": "الخضراء", "type": "residential",
        "lat": 25.0985, "lng": 55.1730,
        "desc": "Mature mid-tier apartment community adjacent to Emirates Golf Club. Walkable, family-friendly; stable rental demand from professionals.",
    },
    "The Views": {
        "arabic": "ذا فيوز", "type": "residential",
        "lat": 25.0998, "lng": 55.1685,
        "desc": "Smaller premium apartment cluster overlooking the Emirates Golf Club fairways. Limited supply; sister to The Greens at slightly higher price band.",
    },
    "Damac Hills": {
        "arabic": "داماك هيلز", "type": "residential",
        "lat": 25.0288, "lng": 55.2580,
        "desc": "Damac master community (formerly Akoya) around Trump International Golf Club. Mix of villas, townhouses, and apartment buildings.",
    },
    "Damac Hills 2": {
        "arabic": "داماك هيلز 2", "type": "residential",
        "lat": 24.9742, "lng": 55.2987,
        "desc": "Affordable extension of Damac Hills positioned 30-40% below central Dubai pricing. Suburban villa-and-townhouse community with resort-style amenities.",
    },
    "Mira Oasis": {
        "arabic": "ميرا أويسيس", "type": "residential",
        "lat": 25.0490, "lng": 55.2660,
        "desc": "Townhouse community within Reem area. Mid-market family pricing with park-rich master plan.",
    },
    "Mudon": {
        "arabic": "مدن", "type": "residential",
        "lat": 25.0398, "lng": 55.2552,
        "desc": "Dubai Properties villa and townhouse community near Mira. Family-oriented; matured demand fundamentals.",
    },
    "Reem": {
        "arabic": "ريم", "type": "residential",
        "lat": 25.0490, "lng": 55.2660,
        "desc": "Mid-tier townhouse master community by Emaar in Dubailand. Family-oriented, healthy yields.",
    },
    "The Sustainable City": {
        "arabic": "المدينة المستدامة", "type": "residential",
        "lat": 24.9879, "lng": 55.2461,
        "desc": "Net-zero villa community pioneer. Solar-powered, car-free clusters with vertical farms. ESG-aligned investor demand at a modest premium.",
    },
    "Town Square": {
        "arabic": "تاون سكوير", "type": "residential",
        "lat": 25.0103, "lng": 55.2772,
        "desc": "Nshama affordable apartment and townhouse community. Strong yields from a young-professional and small-family tenant base.",
    },
    "Dubai Silicon Oasis": {
        "arabic": "واحة دبي للسيليكون", "type": "mixed",
        "lat": 25.1185, "lng": 55.3854,
        "desc": "Free-zone-anchored tech community with mid-market residential. Tenant base of tech professionals; ~1,200 AED/sqft mid-range entry.",
    },
    "International City": {
        "arabic": "المدينة العالمية", "type": "residential",
        "lat": 25.1632, "lng": 55.4080,
        "desc": "Country-themed clusters of affordable apartments. Lowest entry point (~AED 250k studios), 8-9% yields, stable demand from essential workers.",
    },

    # ===== MIXED-USE / COMMERCIAL (12) =====
    "Jumeirah Lake Towers": {
        "arabic": "أبراج بحيرات جميرا", "type": "mixed",
        "lat": 25.0697, "lng": 55.1414,
        "desc": "JLT — dense cluster of 80+ towers around three artificial lakes. Free-zone (DMCC) office stock plus residential. Mid-yield apartment investing.",
    },
    "Dubai Internet City": {
        "arabic": "مدينة دبي للإنترنت", "type": "commercial",
        "lat": 25.0935, "lng": 55.1610,
        "desc": "Dubai's tech and media business hub. Office-heavy with multinational tenants (Google, Microsoft, Oracle). Low vacancy, steady commercial rental income.",
    },
    "Dubai Media City": {
        "arabic": "مدينة دبي للإعلام", "type": "commercial",
        "lat": 25.0911, "lng": 55.1542,
        "desc": "Free-zone hub for media, advertising, and broadcasting firms. Predominantly office; limited residential. Stable tenant covenants from MNCs.",
    },
    "Dubai Knowledge Park": {
        "arabic": "مجمع دبي للمعرفة", "type": "commercial",
        "lat": 25.0944, "lng": 55.1611,
        "desc": "Education and HR-services free zone adjoining Internet City and Media City. Universities, training providers, and serviced offices.",
    },
    "Dubai Healthcare City": {
        "arabic": "مدينة دبي الطبية", "type": "commercial",
        "lat": 25.2310, "lng": 55.3270,
        "desc": "Healthcare-focused free zone with clinics, hospitals, and medical-tourism residences. Niche tenant base; high-spec medical fit-outs.",
    },
    "Dubai Design District": {
        "arabic": "حي دبي للتصميم", "type": "commercial",
        "lat": 25.1882, "lng": 55.2962,
        "desc": "d3 — creative-industries free zone for fashion, design, and architecture firms. Mix of low-rise offices and adjacent residential.",
    },
    "Dubai Production City": {
        "arabic": "مدينة دبي للإنتاج", "type": "mixed",
        "lat": 25.0298, "lng": 55.1969,
        "desc": "Formerly IMPZ. Mix of light-industrial, office, and affordable residential. Tenant base of media and printing professionals.",
    },
    "Dubai Festival City": {
        "arabic": "مدينة دبي للمهرجانات", "type": "mixed",
        "lat": 25.2227, "lng": 55.3530,
        "desc": "Al-Futtaim mixed-use development around the Festival City mall and marina. Residential, hotel, and retail mix.",
    },
    "Al Barsha": {
        "arabic": "البرشاء", "type": "mixed",
        "lat": 25.1097, "lng": 55.2003,
        "desc": "Established mid-tier residential and retail district anchored by Mall of the Emirates. Mixed apartment and villa stock with mature tenant demand.",
    },
    "Al Quoz": {
        "arabic": "القوز", "type": "commercial",
        "lat": 25.1426, "lng": 55.2308,
        "desc": "Industrial-and-warehouse district transitioning toward creative-industry use (art galleries, design studios). Limited residential — mostly worker housing.",
    },
    "Nad Al Sheba": {
        "arabic": "ند الشبا", "type": "residential",
        "lat": 25.1672, "lng": 55.3155,
        "desc": "Established Emirati family villa district adjacent to Meydan. Low density, limited new supply. Steady, conservative appreciation.",
    },
    "Al Furjan": {
        "arabic": "الفرجان", "type": "residential",
        "lat": 25.0271, "lng": 55.1453,
        "desc": "Mid-tier villa and townhouse community by Nakheel near Discovery Gardens. Improving connectivity via Metro Route 2020 extension.",
    },

    # ===== BEACHFRONT / WATERFRONT (10) =====
    "Jumeirah": {
        "arabic": "جميرا", "type": "residential",
        "lat": 25.2308, "lng": 55.2500,
        "desc": "Dubai's original beachfront residential strip. Predominantly villas and low-rise apartments along Jumeirah Beach Road. Long-tenure resident base.",
    },
    "Umm Suqeim": {
        "arabic": "أم سقيم", "type": "residential",
        "lat": 25.1370, "lng": 55.1898,
        "desc": "Established beachfront family district near Burj Al Arab and Madinat Jumeirah. Mix of compounds, villas, and select low-rise apartment blocks.",
    },
    "Madinat Jumeirah Living": {
        "arabic": "مدينة جميرا ليفينج", "type": "residential",
        "lat": 25.1335, "lng": 55.1830,
        "desc": "Dubai Holding low-rise residential next to Madinat Jumeirah. Walking-distance access to Burj Al Arab area. Limited supply, premium positioning.",
    },
    "Jumeirah Bay Island": {
        "arabic": "جزيرة جميرا باي", "type": "residential",
        "lat": 25.2125, "lng": 55.2453,
        "desc": "Bulgari-anchored exclusive island. Branded residences, marina, and yacht club. Among the highest AED/sqft in the city.",
    },
    "Pearl Jumeirah": {
        "arabic": "لؤلؤة جميرا", "type": "residential",
        "lat": 25.2380, "lng": 55.2700,
        "desc": "Boutique reclaimed island adjacent to Jumeirah Bay. Small-scale luxury townhouses and signature villas.",
    },
    "Port De La Mer": {
        "arabic": "بورت دو لا مير", "type": "mixed",
        "lat": 25.2370, "lng": 55.2670,
        "desc": "Mediterranean-themed beachfront marina district by Meraas. Apartments, retail, and a boutique marina. Premium short-let performance.",
    },
    "Marsa Al Arab": {
        "arabic": "مرسى العرب", "type": "mixed",
        "lat": 25.1399, "lng": 55.1825,
        "desc": "New Jumeirah Marsa Al Arab development near Burj Al Arab. Branded residences and hotel apartments. Pre-handover; off-plan-dominant.",
    },
    "Emaar Beachfront": {
        "arabic": "واجهة إعمار البحرية", "type": "residential",
        "lat": 25.0937, "lng": 55.1376,
        "desc": "Beachfront cluster between Marina and Bluewaters by Emaar. Apartment-only towers with direct beach access. Strong short-let appetite.",
    },
    "Dubai Creek Harbour": {
        "arabic": "مرفأ خور دبي", "type": "mixed",
        "lat": 25.2010, "lng": 55.3530,
        "desc": "Emaar's flagship long-horizon waterfront mega-project around the new tallest tower. Currently mid-construction; high off-plan velocity.",
    },
    "Deira Islands": {
        "arabic": "جزر ديرة", "type": "mixed",
        "lat": 25.2880, "lng": 55.3210,
        "desc": "Nakheel reclaimed-island development on Deira's seafront. Mall, residential, and hospitality. Long-horizon thesis.",
    },

    # ===== NEW / EMERGING (8) =====
    "MBR City": {
        "arabic": "مدينة محمد بن راشد", "type": "residential",
        "lat": 25.1690, "lng": 55.2870,
        "desc": "Mohammed Bin Rashid City master plan including District One. Large-format luxury villas around a crystal lagoon. Growth-led capital appreciation.",
    },
    "District One": {
        "arabic": "ديستركت 1", "type": "residential",
        "lat": 25.1639, "lng": 55.3009,
        "desc": "Meydan-adjacent ultra-luxury villa enclave within MBR City. Mansions around the Crystal Lagoon. Limited resale stock.",
    },
    "Tilal Al Ghaf": {
        "arabic": "تلال الغاف", "type": "residential",
        "lat": 25.0269, "lng": 55.2540,
        "desc": "Majid Al Futtaim flagship community anchored by a crystal lagoon. All-villa; off-plan demand has pulled forward future appreciation.",
    },
    "The Valley": {
        "arabic": "الوادي", "type": "residential",
        "lat": 25.0140, "lng": 55.3835,
        "desc": "Emaar emerging townhouse community in eastern Dubailand. Family-focused, affordable entry to Emaar inventory.",
    },
    "Expo City Dubai": {
        "arabic": "مدينة إكسبو دبي", "type": "mixed",
        "lat": 24.9579, "lng": 55.1488,
        "desc": "Legacy site of Expo 2020 repurposed as a sustainable city district. Office, residential, and innovation campuses. Early-stage growth profile.",
    },
    "Liwan": {
        "arabic": "ليوان", "type": "residential",
        "lat": 25.1144, "lng": 55.3567,
        "desc": "Affordable apartment cluster within Dubailand. Strong yields from low entry pricing; emerging community.",
    },
    "Mirdif": {
        "arabic": "مردف", "type": "residential",
        "lat": 25.2167, "lng": 55.4192,
        "desc": "Established eastern Dubai family district with compounds and villas. Schools-rich; long-term resident base. Modest appreciation, stable demand.",
    },
    "Dubai Waterfront": {
        "arabic": "واجهة دبي البحرية", "type": "mixed",
        "lat": 25.0010, "lng": 54.9810,
        "desc": "Long-horizon Nakheel waterfront mega-development in Jebel Ali area. Phased delivery; sparse current resale data.",
    },

    # ===== OLD DUBAI (5) =====
    "Deira": {
        "arabic": "ديرة", "type": "mixed",
        "lat": 25.2697, "lng": 55.3094,
        "desc": "Dubai's historic commercial heart on the eastern bank of the Creek. Legacy apartments, retail, and traditional souks. High yield from low entry price and steady working-class tenant demand.",
    },
    "Bur Dubai": {
        "arabic": "بر دبي", "type": "mixed",
        "lat": 25.2532, "lng": 55.2972,
        "desc": "Western-Creek-side historic district. Mid-rise residential, traditional souks, government buildings. Steady yield, lower appreciation.",
    },
    "Karama": {
        "arabic": "الكرامة", "type": "residential",
        "lat": 25.2466, "lng": 55.3050,
        "desc": "Dense established mid-tier residential district between Bur Dubai and the Creek. Walking-friendly, mid-market. Stable yields from long-tenure tenants.",
    },
    "Al Satwa": {
        "arabic": "السطوة", "type": "mixed",
        "lat": 25.2330, "lng": 55.2790,
        "desc": "Historic mid-tier district between Sheikh Zayed Road and Jumeirah. Mix of older low-rise apartments and small commercial. Redevelopment pressure on legacy stock.",
    },
    "Al Wasl": {
        "arabic": "الوصل", "type": "mixed",
        "lat": 25.2155, "lng": 55.2647,
        "desc": "Established mid-tier district bridging Jumeirah and Al Safa. Strong family demographics, low density, walking access to City Walk and Box Park.",
    },
}


# ---------------------------------------------------------------------------
# AREA BASELINES — Q1 2026 market metrics per area
# ---------------------------------------------------------------------------
# All numbers calibrated to public-source aggregates (Bayut, ValuStrat,
# Knight Frank, PropertyFinder, government records).

AREA_BASELINES: dict[str, dict] = {
    # ===== PREMIUM / LUXURY =====
    "Downtown Dubai":            {"price_per_sqft": 2850, "avg_size_sqft": 1100, "rental_yield": 5.8, "occupancy": 93, "appreciation_1y": 10.2, "appreciation_3y": 33.5, "tx_volume": 980,  "demand": 9.4, "risk": 3.8, "investment": 8.8},
    "Palm Jumeirah":             {"price_per_sqft": 3900, "avg_size_sqft": 1450, "rental_yield": 5.0, "occupancy": 92, "appreciation_1y": 11.2, "appreciation_3y": 40.0, "tx_volume": 620,  "demand": 9.0, "risk": 3.5, "investment": 8.5},
    "Dubai Marina":              {"price_per_sqft": 2200, "avg_size_sqft": 1050, "rental_yield": 6.5, "occupancy": 92, "appreciation_1y": 9.0,  "appreciation_3y": 27.0, "tx_volume": 1450, "demand": 9.1, "risk": 4.2, "investment": 8.6},
    "Business Bay":              {"price_per_sqft": 2650, "avg_size_sqft": 950,  "rental_yield": 6.4, "occupancy": 90, "appreciation_1y": 8.6,  "appreciation_3y": 24.0, "tx_volume": 1320, "demand": 8.7, "risk": 4.4, "investment": 8.3},
    "Dubai Hills Estate":        {"price_per_sqft": 2100, "avg_size_sqft": 1280, "rental_yield": 6.4, "occupancy": 92, "appreciation_1y": 12.5, "appreciation_3y": 32.0, "tx_volume": 1080, "demand": 9.0, "risk": 3.9, "investment": 8.7},
    "Emirates Hills":            {"price_per_sqft": 7500, "avg_size_sqft": 8000, "rental_yield": 3.2, "occupancy": 88, "appreciation_1y": 11.0, "appreciation_3y": 35.0, "tx_volume": 110,  "demand": 8.9, "risk": 2.8, "investment": 8.6},
    "Bluewaters Island":         {"price_per_sqft": 3450, "avg_size_sqft": 1180, "rental_yield": 5.2, "occupancy": 91, "appreciation_1y": 10.8, "appreciation_3y": 32.5, "tx_volume": 240,  "demand": 8.5, "risk": 3.4, "investment": 8.3},
    "DIFC":                      {"price_per_sqft": 3100, "avg_size_sqft": 1200, "rental_yield": 5.4, "occupancy": 94, "appreciation_1y": 9.5,  "appreciation_3y": 28.0, "tx_volume": 320,  "demand": 9.0, "risk": 3.2, "investment": 8.6},
    "Jumeirah Beach Residence":  {"price_per_sqft": 2000, "avg_size_sqft": 1100, "rental_yield": 6.8, "occupancy": 93, "appreciation_1y": 8.4,  "appreciation_3y": 23.5, "tx_volume": 1180, "demand": 8.9, "risk": 4.0, "investment": 8.4},
    "The Lakes":                 {"price_per_sqft": 1850, "avg_size_sqft": 3600, "rental_yield": 5.0, "occupancy": 92, "appreciation_1y": 9.6,  "appreciation_3y": 28.5, "tx_volume": 180,  "demand": 8.0, "risk": 3.5, "investment": 8.0},
    "The Meadows":               {"price_per_sqft": 1750, "avg_size_sqft": 4200, "rental_yield": 4.9, "occupancy": 92, "appreciation_1y": 9.3,  "appreciation_3y": 27.0, "tx_volume": 220,  "demand": 8.0, "risk": 3.5, "investment": 8.0},
    "The Springs":               {"price_per_sqft": 1450, "avg_size_sqft": 2400, "rental_yield": 5.4, "occupancy": 91, "appreciation_1y": 8.8,  "appreciation_3y": 24.5, "tx_volume": 350,  "demand": 7.9, "risk": 3.8, "investment": 7.9},
    "Arabian Ranches":           {"price_per_sqft": 1550, "avg_size_sqft": 3500, "rental_yield": 5.2, "occupancy": 92, "appreciation_1y": 9.1,  "appreciation_3y": 26.5, "tx_volume": 420,  "demand": 8.1, "risk": 3.7, "investment": 8.1},
    "City Walk":                 {"price_per_sqft": 2700, "avg_size_sqft": 980,  "rental_yield": 5.8, "occupancy": 91, "appreciation_1y": 9.0,  "appreciation_3y": 25.0, "tx_volume": 410,  "demand": 8.4, "risk": 4.0, "investment": 8.1},
    "La Mer":                    {"price_per_sqft": 2950, "avg_size_sqft": 1150, "rental_yield": 5.5, "occupancy": 90, "appreciation_1y": 8.6,  "appreciation_3y": 22.5, "tx_volume": 220,  "demand": 8.0, "risk": 4.2, "investment": 7.9},

    # ===== MID-RANGE RESIDENTIAL =====
    "Jumeirah Village Circle":   {"price_per_sqft": 1450, "avg_size_sqft": 880,  "rental_yield": 8.5, "occupancy": 90, "appreciation_1y": 12.6, "appreciation_3y": 33.0, "tx_volume": 2150, "demand": 9.0, "risk": 5.0, "investment": 8.8},
    "Arjan":                     {"price_per_sqft": 1100, "avg_size_sqft": 850,  "rental_yield": 8.4, "occupancy": 87, "appreciation_1y": 11.3, "appreciation_3y": 24.0, "tx_volume": 1240, "demand": 7.7, "risk": 5.3, "investment": 8.0},
    "Dubai South":               {"price_per_sqft": 1050, "avg_size_sqft": 920,  "rental_yield": 8.9, "occupancy": 84, "appreciation_1y": 13.5, "appreciation_3y": 26.0, "tx_volume": 1680, "demand": 8.0, "risk": 6.0, "investment": 8.1},
    "Meydan":                    {"price_per_sqft": 1900, "avg_size_sqft": 1180, "rental_yield": 6.4, "occupancy": 91, "appreciation_1y": 10.3, "appreciation_3y": 28.5, "tx_volume": 910,  "demand": 8.5, "risk": 4.2, "investment": 8.4},
    "Jumeirah Village Triangle": {"price_per_sqft": 1100, "avg_size_sqft": 1100, "rental_yield": 7.8, "occupancy": 88, "appreciation_1y": 10.5, "appreciation_3y": 26.0, "tx_volume": 980,  "demand": 8.2, "risk": 5.0, "investment": 8.2},
    "Dubai Sports City":         {"price_per_sqft": 1080, "avg_size_sqft": 820,  "rental_yield": 8.7, "occupancy": 87, "appreciation_1y": 10.5, "appreciation_3y": 21.0, "tx_volume": 1180, "demand": 7.6, "risk": 5.4, "investment": 7.9},
    "Dubai Studio City":         {"price_per_sqft": 950,  "avg_size_sqft": 800,  "rental_yield": 8.6, "occupancy": 85, "appreciation_1y": 9.4,  "appreciation_3y": 18.0, "tx_volume": 720,  "demand": 7.0, "risk": 5.6, "investment": 7.6},
    "Motor City":                {"price_per_sqft": 1080, "avg_size_sqft": 880,  "rental_yield": 8.2, "occupancy": 87, "appreciation_1y": 9.0,  "appreciation_3y": 19.5, "tx_volume": 680,  "demand": 7.2, "risk": 5.2, "investment": 7.7},
    "Discovery Gardens":         {"price_per_sqft": 950,  "avg_size_sqft": 700,  "rental_yield": 9.2, "occupancy": 92, "appreciation_1y": 8.0,  "appreciation_3y": 17.0, "tx_volume": 1080, "demand": 7.4, "risk": 5.0, "investment": 7.7},
    "The Greens":                {"price_per_sqft": 1620, "avg_size_sqft": 920,  "rental_yield": 7.0, "occupancy": 92, "appreciation_1y": 8.6,  "appreciation_3y": 22.0, "tx_volume": 540,  "demand": 8.1, "risk": 4.2, "investment": 8.1},
    "The Views":                 {"price_per_sqft": 1780, "avg_size_sqft": 1050, "rental_yield": 6.6, "occupancy": 92, "appreciation_1y": 8.8,  "appreciation_3y": 22.5, "tx_volume": 280,  "demand": 8.0, "risk": 4.0, "investment": 8.1},
    "Damac Hills":               {"price_per_sqft": 1280, "avg_size_sqft": 1500, "rental_yield": 6.8, "occupancy": 87, "appreciation_1y": 9.7,  "appreciation_3y": 22.0, "tx_volume": 760,  "demand": 7.5, "risk": 5.0, "investment": 7.8},
    "Damac Hills 2":             {"price_per_sqft": 880,  "avg_size_sqft": 1900, "rental_yield": 7.4, "occupancy": 82, "appreciation_1y": 11.5, "appreciation_3y": 18.0, "tx_volume": 1120, "demand": 7.0, "risk": 6.2, "investment": 7.5},
    "Mira Oasis":                {"price_per_sqft": 1080, "avg_size_sqft": 2100, "rental_yield": 6.6, "occupancy": 89, "appreciation_1y": 9.4,  "appreciation_3y": 21.0, "tx_volume": 380,  "demand": 7.5, "risk": 4.7, "investment": 7.8},
    "Mudon":                     {"price_per_sqft": 1100, "avg_size_sqft": 2200, "rental_yield": 6.6, "occupancy": 89, "appreciation_1y": 9.6,  "appreciation_3y": 22.0, "tx_volume": 420,  "demand": 7.6, "risk": 4.6, "investment": 7.9},
    "Reem":                      {"price_per_sqft": 1050, "avg_size_sqft": 2100, "rental_yield": 6.8, "occupancy": 88, "appreciation_1y": 9.0,  "appreciation_3y": 19.0, "tx_volume": 340,  "demand": 7.3, "risk": 4.8, "investment": 7.7},
    "The Sustainable City":      {"price_per_sqft": 1320, "avg_size_sqft": 2000, "rental_yield": 6.4, "occupancy": 90, "appreciation_1y": 8.6,  "appreciation_3y": 20.5, "tx_volume": 180,  "demand": 7.8, "risk": 4.3, "investment": 7.9},
    "Town Square":               {"price_per_sqft": 970,  "avg_size_sqft": 1100, "rental_yield": 8.1, "occupancy": 88, "appreciation_1y": 9.8,  "appreciation_3y": 20.0, "tx_volume": 1080, "demand": 7.5, "risk": 5.0, "investment": 7.9},
    "Dubai Silicon Oasis":       {"price_per_sqft": 1180, "avg_size_sqft": 900,  "rental_yield": 8.0, "occupancy": 88, "appreciation_1y": 8.6,  "appreciation_3y": 18.0, "tx_volume": 880,  "demand": 7.5, "risk": 4.9, "investment": 7.8},
    "International City":        {"price_per_sqft": 720,  "avg_size_sqft": 620,  "rental_yield": 9.5, "occupancy": 91, "appreciation_1y": 6.5,  "appreciation_3y": 14.0, "tx_volume": 1620, "demand": 7.2, "risk": 5.4, "investment": 7.5},

    # ===== MIXED-USE / COMMERCIAL =====
    "Jumeirah Lake Towers":      {"price_per_sqft": 1700, "avg_size_sqft": 970,  "rental_yield": 7.3, "occupancy": 89, "appreciation_1y": 7.8,  "appreciation_3y": 21.0, "tx_volume": 1390, "demand": 8.3, "risk": 4.5, "investment": 8.2},
    "Dubai Internet City":       {"price_per_sqft": 1450, "avg_size_sqft": 1400, "rental_yield": 7.5, "occupancy": 92, "appreciation_1y": 6.5,  "appreciation_3y": 18.5, "tx_volume": 220,  "demand": 8.6, "risk": 4.0, "investment": 8.0},
    "Dubai Media City":          {"price_per_sqft": 1420, "avg_size_sqft": 1350, "rental_yield": 7.3, "occupancy": 93, "appreciation_1y": 6.2,  "appreciation_3y": 17.5, "tx_volume": 210,  "demand": 8.5, "risk": 4.0, "investment": 7.9},
    "Dubai Knowledge Park":      {"price_per_sqft": 1320, "avg_size_sqft": 1100, "rental_yield": 7.1, "occupancy": 90, "appreciation_1y": 5.8,  "appreciation_3y": 15.0, "tx_volume": 150,  "demand": 7.6, "risk": 4.3, "investment": 7.5},
    "Dubai Healthcare City":     {"price_per_sqft": 1480, "avg_size_sqft": 1200, "rental_yield": 7.0, "occupancy": 89, "appreciation_1y": 6.0,  "appreciation_3y": 14.5, "tx_volume": 140,  "demand": 7.4, "risk": 4.5, "investment": 7.5},
    "Dubai Design District":     {"price_per_sqft": 1850, "avg_size_sqft": 1100, "rental_yield": 6.7, "occupancy": 91, "appreciation_1y": 7.2,  "appreciation_3y": 19.0, "tx_volume": 180,  "demand": 7.9, "risk": 4.2, "investment": 7.8},
    "Dubai Production City":     {"price_per_sqft": 950,  "avg_size_sqft": 950,  "rental_yield": 8.5, "occupancy": 86, "appreciation_1y": 7.6,  "appreciation_3y": 15.5, "tx_volume": 540,  "demand": 7.0, "risk": 5.2, "investment": 7.5},
    "Dubai Festival City":       {"price_per_sqft": 1480, "avg_size_sqft": 1200, "rental_yield": 7.0, "occupancy": 89, "appreciation_1y": 7.0,  "appreciation_3y": 16.0, "tx_volume": 280,  "demand": 7.6, "risk": 4.5, "investment": 7.7},
    "Al Barsha":                 {"price_per_sqft": 1280, "avg_size_sqft": 1500, "rental_yield": 7.2, "occupancy": 90, "appreciation_1y": 7.4,  "appreciation_3y": 18.0, "tx_volume": 560,  "demand": 7.8, "risk": 4.5, "investment": 7.8},
    "Al Quoz":                   {"price_per_sqft": 780,  "avg_size_sqft": 1100, "rental_yield": 8.4, "occupancy": 84, "appreciation_1y": 5.4,  "appreciation_3y": 11.5, "tx_volume": 320,  "demand": 6.5, "risk": 5.8, "investment": 6.9},
    "Nad Al Sheba":              {"price_per_sqft": 1380, "avg_size_sqft": 4500, "rental_yield": 5.6, "occupancy": 91, "appreciation_1y": 8.4,  "appreciation_3y": 21.0, "tx_volume": 280,  "demand": 7.6, "risk": 4.2, "investment": 7.7},
    "Al Furjan":                 {"price_per_sqft": 1180, "avg_size_sqft": 1850, "rental_yield": 6.8, "occupancy": 89, "appreciation_1y": 9.4,  "appreciation_3y": 22.0, "tx_volume": 680,  "demand": 7.7, "risk": 4.7, "investment": 7.9},

    # ===== BEACHFRONT / WATERFRONT =====
    "Jumeirah":                  {"price_per_sqft": 2200, "avg_size_sqft": 3800, "rental_yield": 4.6, "occupancy": 91, "appreciation_1y": 8.4,  "appreciation_3y": 22.0, "tx_volume": 380,  "demand": 8.4, "risk": 3.6, "investment": 8.0},
    "Umm Suqeim":                {"price_per_sqft": 2050, "avg_size_sqft": 4200, "rental_yield": 4.5, "occupancy": 91, "appreciation_1y": 7.8,  "appreciation_3y": 20.5, "tx_volume": 260,  "demand": 8.0, "risk": 3.8, "investment": 7.8},
    "Madinat Jumeirah Living":   {"price_per_sqft": 2380, "avg_size_sqft": 1200, "rental_yield": 5.4, "occupancy": 92, "appreciation_1y": 9.6,  "appreciation_3y": 24.0, "tx_volume": 320,  "demand": 8.4, "risk": 3.8, "investment": 8.1},
    "Jumeirah Bay Island":       {"price_per_sqft": 5200, "avg_size_sqft": 1900, "rental_yield": 3.6, "occupancy": 88, "appreciation_1y": 11.5, "appreciation_3y": 36.0, "tx_volume": 50,   "demand": 8.8, "risk": 3.0, "investment": 8.4},
    "Pearl Jumeirah":            {"price_per_sqft": 2980, "avg_size_sqft": 3800, "rental_yield": 4.4, "occupancy": 88, "appreciation_1y": 10.0, "appreciation_3y": 28.0, "tx_volume": 70,   "demand": 8.0, "risk": 3.6, "investment": 7.9},
    "Port De La Mer":            {"price_per_sqft": 2780, "avg_size_sqft": 1250, "rental_yield": 5.6, "occupancy": 89, "appreciation_1y": 10.8, "appreciation_3y": 25.0, "tx_volume": 280,  "demand": 8.3, "risk": 4.0, "investment": 8.2},
    "Marsa Al Arab":             {"price_per_sqft": 3850, "avg_size_sqft": 1400, "rental_yield": 4.8, "occupancy": 85, "appreciation_1y": 13.5, "appreciation_3y": 28.0, "tx_volume": 180,  "demand": 8.4, "risk": 4.5, "investment": 8.0},
    "Emaar Beachfront":          {"price_per_sqft": 2880, "avg_size_sqft": 1180, "rental_yield": 5.8, "occupancy": 90, "appreciation_1y": 11.6, "appreciation_3y": 30.0, "tx_volume": 720,  "demand": 8.7, "risk": 3.9, "investment": 8.5},
    "Dubai Creek Harbour":       {"price_per_sqft": 2350, "avg_size_sqft": 1100, "rental_yield": 5.4, "occupancy": 84, "appreciation_1y": 14.8, "appreciation_3y": 36.0, "tx_volume": 920,  "demand": 8.6, "risk": 5.2, "investment": 8.4},
    "Deira Islands":             {"price_per_sqft": 1450, "avg_size_sqft": 1100, "rental_yield": 6.6, "occupancy": 80, "appreciation_1y": 9.4,  "appreciation_3y": 18.0, "tx_volume": 280,  "demand": 7.0, "risk": 6.0, "investment": 7.3},

    # ===== NEW / EMERGING =====
    "MBR City":                  {"price_per_sqft": 2080, "avg_size_sqft": 2400, "rental_yield": 5.6, "occupancy": 87, "appreciation_1y": 13.0, "appreciation_3y": 32.0, "tx_volume": 460,  "demand": 8.4, "risk": 5.2, "investment": 8.3},
    "District One":              {"price_per_sqft": 2680, "avg_size_sqft": 5800, "rental_yield": 4.4, "occupancy": 86, "appreciation_1y": 13.4, "appreciation_3y": 33.0, "tx_volume": 180,  "demand": 8.5, "risk": 4.6, "investment": 8.2},
    "Tilal Al Ghaf":             {"price_per_sqft": 2200, "avg_size_sqft": 2800, "rental_yield": 5.5, "occupancy": 86, "appreciation_1y": 14.2, "appreciation_3y": 32.5, "tx_volume": 480,  "demand": 8.4, "risk": 5.8, "investment": 8.3},
    "The Valley":                {"price_per_sqft": 1080, "avg_size_sqft": 2200, "rental_yield": 6.6, "occupancy": 82, "appreciation_1y": 13.6, "appreciation_3y": 22.0, "tx_volume": 720,  "demand": 7.2, "risk": 6.2, "investment": 7.6},
    "Expo City Dubai":           {"price_per_sqft": 1180, "avg_size_sqft": 1100, "rental_yield": 6.8, "occupancy": 80, "appreciation_1y": 12.5, "appreciation_3y": 20.0, "tx_volume": 380,  "demand": 7.5, "risk": 6.4, "investment": 7.6},
    "Liwan":                     {"price_per_sqft": 880,  "avg_size_sqft": 820,  "rental_yield": 8.6, "occupancy": 85, "appreciation_1y": 8.6,  "appreciation_3y": 16.0, "tx_volume": 520,  "demand": 6.8, "risk": 5.4, "investment": 7.3},
    "Mirdif":                    {"price_per_sqft": 1080, "avg_size_sqft": 2400, "rental_yield": 6.4, "occupancy": 91, "appreciation_1y": 6.4,  "appreciation_3y": 14.0, "tx_volume": 540,  "demand": 7.2, "risk": 4.4, "investment": 7.4},
    "Dubai Waterfront":          {"price_per_sqft": 880,  "avg_size_sqft": 1200, "rental_yield": 6.4, "occupancy": 70, "appreciation_1y": 8.8,  "appreciation_3y": 12.0, "tx_volume": 120,  "demand": 5.6, "risk": 7.2, "investment": 6.4},

    # ===== OLD DUBAI =====
    "Deira":                     {"price_per_sqft": 850,  "avg_size_sqft": 850,  "rental_yield": 8.9, "occupancy": 88, "appreciation_1y": 4.5,  "appreciation_3y": 11.0, "tx_volume": 720,  "demand": 6.8, "risk": 5.5, "investment": 6.9},
    "Bur Dubai":                 {"price_per_sqft": 870,  "avg_size_sqft": 900,  "rental_yield": 8.7, "occupancy": 89, "appreciation_1y": 4.8,  "appreciation_3y": 12.0, "tx_volume": 580,  "demand": 6.9, "risk": 5.2, "investment": 6.9},
    "Karama":                    {"price_per_sqft": 920,  "avg_size_sqft": 800,  "rental_yield": 8.5, "occupancy": 92, "appreciation_1y": 5.2,  "appreciation_3y": 12.5, "tx_volume": 480,  "demand": 7.2, "risk": 4.6, "investment": 7.2},
    "Al Satwa":                  {"price_per_sqft": 980,  "avg_size_sqft": 850,  "rental_yield": 8.1, "occupancy": 90, "appreciation_1y": 5.8,  "appreciation_3y": 13.0, "tx_volume": 320,  "demand": 7.0, "risk": 4.8, "investment": 7.1},
    "Al Wasl":                   {"price_per_sqft": 1620, "avg_size_sqft": 2400, "rental_yield": 5.8, "occupancy": 92, "appreciation_1y": 8.0,  "appreciation_3y": 19.5, "tx_volume": 240,  "demand": 7.8, "risk": 4.2, "investment": 7.8},
}


# ---------------------------------------------------------------------------
# Snapshot generator
# ---------------------------------------------------------------------------

def month_offset(target: date, months_back: int) -> date:
    total = target.year * 12 + (target.month - 1) - months_back
    y, m = divmod(total, 12)
    return date(y, m + 1, 1)


def build_snapshots(area_id, baseline: dict, today: date) -> list[dict]:
    """Generate 12 monthly snapshots trending back from today."""
    snapshots: list[dict] = []
    appreciation = baseline["appreciation_1y"] / 100.0
    current_pps = baseline["price_per_sqft"]
    size = baseline["avg_size_sqft"]

    for i in range(12):
        months_ago = 11 - i
        progress = (12 - months_ago) / 12.0
        factor = (1 / (1 + appreciation)) + (1 - 1 / (1 + appreciation)) * progress
        # Deterministic small "noise" so charts look organic, not flat
        noise = 1 + ((i * 37 + 13) % 30 - 15) / 1000.0
        pps = current_pps * factor * noise
        sale_price = pps * size
        annual_rent = sale_price * (baseline["rental_yield"] / 100.0) * noise
        vol_factor = 0.85 + 0.3 * ((i + 3) % 12) / 12.0
        tx_vol = int(baseline["tx_volume"] * vol_factor / 12)

        snapshots.append({
            "area_id": area_id,
            "snapshot_date": month_offset(today, months_ago),
            "avg_sale_price": round(sale_price, 2),
            "avg_price_per_sqft": round(pps, 2),
            "avg_annual_rent": round(annual_rent, 2),
            "rental_yield": round(baseline["rental_yield"] * noise, 2),
            "occupancy_rate": round(baseline["occupancy"] - (11 - i) * 0.15, 2),
            "appreciation_1y": round(baseline["appreciation_1y"] * (0.7 + 0.3 * progress), 2),
            "appreciation_3y": round(baseline["appreciation_3y"], 2),
            "transaction_volume": tx_vol,
            "demand_score": round(baseline["demand"], 1),
            "risk_score": round(baseline["risk"], 1),
            "investment_score": round(baseline["investment"], 1),
            "data_source": DATA_SOURCE,
        })
    return snapshots


async def upsert_areas_with_session(session) -> int:
    """UPSERT every area in AREA_CATALOG. Idempotent by name."""
    existing = (await session.execute(select(Area))).scalars().all()
    by_name = {a.name: a for a in existing}
    added = 0
    for name, meta in AREA_CATALOG.items():
        if name in by_name:
            a = by_name[name]
            # Refresh metadata (so renames/coord fixes propagate)
            a.name_arabic = meta["arabic"]
            a.area_type = meta["type"]
            a.latitude = meta["lat"]
            a.longitude = meta["lng"]
            a.description = meta["desc"]
            continue
        session.add(Area(
            name=name,
            name_arabic=meta["arabic"],
            city="Dubai",
            emirate="Dubai",
            area_type=meta["type"],
            latitude=meta["lat"],
            longitude=meta["lng"],
            description=meta["desc"],
        ))
        added += 1
    await session.commit()
    return added


async def seed_snapshots_with_session(session) -> dict:
    """Idempotent: upsert areas, then re-seed 12 monthly snapshots per area."""
    today = date.today()

    added = await upsert_areas_with_session(session)
    areas = (await session.execute(select(Area))).scalars().all()
    if not areas:
        return {"areas": 0, "snapshots": 0, "error": "no areas after upsert"}

    await session.execute(delete(MarketSnapshot))
    await session.commit()

    total = 0
    seeded_areas = 0
    skipped = []
    for area in areas:
        baseline = AREA_BASELINES.get(area.name)
        if not baseline:
            skipped.append(area.name)
            continue
        for snap in build_snapshots(area.id, baseline, today):
            session.add(MarketSnapshot(**snap))
        total += 12
        seeded_areas += 1

    await session.commit()
    return {
        "areas": seeded_areas,
        "snapshots": total,
        "areas_added": added,
        "areas_total": len(areas),
        "skipped": skipped[:10],  # first 10 for visibility
    }
