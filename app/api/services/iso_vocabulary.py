"""
ISO 19115-compliant controlled vocabularies for hazard image metadata
"""

# ISO 19115 Topic Categories
ISO_TOPIC_CATEGORIES = [
    "farming",
    "biota", 
    "boundaries",
    "climatologyMeteorologyAtmosphere",
    "economy",
    "elevation",
    "environment",
    "geoscientificInformation",
    "health",
    "imageryBaseMapsEarthCover",
    "intelligenceMilitary", 
    "inlandWaters",
    "location",
    "oceans",
    "planningCadastre",
    "society",
    "structure",
    "transportation",
    "utilitiesCommunication"
]

# SPC Hazard Vocabulary - aligned with international standards
# Supported ISO 639-2 language codes
LANGUAGE_CODES = ["eng", "fra"]

HAZARD_TYPES = {
    "cyclone": {
        "name": {
            "eng": "Cyclone",
            "fra": "Cyclone",
        },
        "keywords": {
            "eng": [
                "tropical cyclone",
                "hurricane",
                "typhoon",
                "storm surge",
                "wind damage",
            ],
            "fra": [
                "cyclone tropical",
                "ouragan",
                "typhon",
                "onde de tempête",
                "dommages causés par le vent",
            ],
        },
        "topic_categories": ["climatologyMeteorologyAtmosphere", "environment"],
    },
    "flood": {
        "name": {
            "eng": "Flood",
            "fra": "Inondation",
        },
        "keywords": {
            "eng": [
                "flooding",
                "inundation",
                "riverine flood",
                "coastal flood",
                "flash flood",
            ],
            "fra": [
                "inondation",
                "submersion",
                "crue fluviale",
                "inondation côtière",
                "crue éclair",
            ],
        },
        "topic_categories": ["inlandWaters", "environment"],
    },
    "drought": {
        "name": {
            "eng": "Drought",
            "fra": "Sécheresse",
        },
        "keywords": {
            "eng": [
                "drought",
                "water scarcity",
                "agricultural drought",
                "meteorological drought",
            ],
            "fra": [
                "sécheresse",
                "pénurie d'eau",
                "sécheresse agricole",
                "sécheresse météorologique",
            ],
        },
        "topic_categories": [
            "climatologyMeteorologyAtmosphere",
            "farming",
            "environment",
        ],
    },
    "landslide": {
        "name": {
            "eng": "Landslide",
            "fra": "Glissement de terrain",
        },
        "keywords": {
            "eng": [
                "landslide",
                "mass movement",
                "slope failure",
                "debris flow",
            ],
            "fra": [
                "glissement de terrain",
                "mouvement de masse",
                "rupture de pente",
                "coulée de débris",
            ],
        },
        "topic_categories": ["geoscientificInformation", "environment"],
    },
    "tsunami": {
        "name": {
            "eng": "Tsunami",
            "fra": "Tsunami",
        },
        "keywords": {
            "eng": [
                "tsunami",
                "seismic sea wave",
                "coastal inundation",
                "wave damage",
            ],
            "fra": [
                "tsunami",
                "vague sismique",
                "inondation côtière",
                "dommages causés par les vagues",
            ],
        },
        "topic_categories": [
            "oceans",
            "geoscientificInformation",
            "environment",
        ],
    },
    "earthquake": {
        "name": {
            "eng": "Earthquake",
            "fra": "Tremblement de terre",
        },
        "keywords": {
            "eng": [
                "earthquake",
                "seismic activity",
                "ground shaking",
                "structural damage",
            ],
            "fra": [
                "tremblement de terre",
                "activité sismique",
                "secousses du sol",
                "dommages structurels",
            ],
        },
        "topic_categories": ["geoscientificInformation", "environment"],
    },
    "volcano": {
        "name": {
            "eng": "Volcano",
            "fra": "Volcan",
        },
        "keywords": {
            "eng": [
                "volcanic eruption",
                "lava flow",
                "ash fall",
                "pyroclastic flow",
            ],
            "fra": [
                "éruption volcanique",
                "coulée de lave",
                "retombée de cendres",
                "coulée pyroclastique",
            ],
        },
        "topic_categories": ["geoscientificInformation", "environment"],
    },
    "wildfire": {
        "name": {
            "eng": "Wildfire",
            "fra": "Feu de forêt",
        },
        "keywords": {
            "eng": [
                "wildfire",
                "bushfire",
                "forest fire",
                "vegetation fire",
            ],
            "fra": [
                "feu de forêt",
                "feu de brousse",
                "incendie de forêt",
                "feu de végétation",
            ],
        },
        "topic_categories": ["biota", "environment"],
    },
}

# ISO 19115 Status values
STATUS_VALUES = [
    "Completed",
    "HistoricalArchive", 
    "Obsolete",
    "OnGoing",
    "Planned",
    "Required",
    "UnderDevelopment"
]

# ISO 19115 Maintenance Frequency
MAINTENANCE_FREQUENCY = [
    "Continual",
    "Daily", 
    "Weekly",
    "Fortnightly",
    "Monthly",
    "Quarterly",
    "Biannually",
    "Annually",
    "AsNeeded",
    "Irregular",
    "NotPlanned",
    "Unknown"
]

# Capture methods for lineage
CAPTURE_METHODS = [
    "Mobile phone camera",
    "Digital camera",
    "Drone/UAV",
    "Satellite imagery",
    "Aerial photography",
    "Ground-based sensor",
    "Webcam",
    "Security camera"
]

# Access constraints
ACCESS_CONSTRAINTS = [
    "Copyright",
    "Patent", 
    "PatentPending",
    "Trademark",
    "License",
    "IntellectualPropertyRights",
    "Restricted",
    "OtherRestrictions",
    "Public"
]

# Security classifications
SECURITY_CLASSIFICATIONS = [
    "Unclassified",
    "Restricted", 
    "Confidential",
    "Secret",
    "TopSecret"
]

def get_hazard_name(hazard_type: str, language: str = "eng") -> str:
    """Get the localized hazard name"""
    return (
        HAZARD_TYPES.get(hazard_type, {})
        .get("name", {})
        .get(language, hazard_type)
    )


def get_hazard_keywords(hazard_type: str, language: str = "eng") -> list:
    """Get ISO-compliant keywords for a hazard type"""
    return (
        HAZARD_TYPES.get(hazard_type, {})
        .get("keywords", {})
        .get(language, [])
    )

def get_hazard_topic_categories(hazard_type: str) -> list:
    """Get ISO topic categories for a hazard type"""
    base_categories = ["environment", "imageryBaseMapsEarthCover"]
    hazard_categories = HAZARD_TYPES.get(hazard_type, {}).get("topic_categories", [])
    return list(set(base_categories + hazard_categories))

def create_geographic_bounding_box(latitude: float, longitude: float, buffer: float = 0.001) -> dict:
    """Create a geographic bounding box around a point"""
    if latitude is None or longitude is None:
        return None
        
    return {
        "westBoundLongitude": longitude - buffer,
        "eastBoundLongitude": longitude + buffer, 
        "southBoundLatitude": latitude - buffer,
        "northBoundLatitude": latitude + buffer
    }

def generate_iso_title(hazard_type: str, location: str, timestamp) -> str:
    """Generate ISO-compliant title"""
    date_str = timestamp.strftime("%Y-%m-%d") if timestamp else "unknown date"
    return f"{hazard_type.title()} Hazard Image - {location} ({date_str})"

def generate_iso_abstract(hazard_type: str, location: str, timestamp, purpose: str = None) -> str:
    """Generate ISO-compliant abstract"""
    date_str = timestamp.strftime("%Y-%m-%d %H:%M UTC") if timestamp else "unknown date"
    base_abstract = f"Image documenting {hazard_type} hazard impacts at {location} captured on {date_str}."
    
    if purpose:
        base_abstract += f" Purpose: {purpose}."

    return base_abstract
