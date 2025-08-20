from xml.etree.ElementTree import Element, SubElement, tostring, register_namespace
from ..schemas.iso_metadata import ISO19115Metadata

GMD = "http://www.isotc211.org/2005/gmd"
GCO = "http://www.isotc211.org/2005/gco"

register_namespace('gmd', GMD)
register_namespace('gco', GCO)

def metadata_to_iso19139(metadata: ISO19115Metadata) -> str:
    """Convert ISO19115Metadata instance to ISO 19139 XML string."""
    root = Element(f"{{{GMD}}}MD_Metadata")

    file_id = SubElement(root, f"{{{GMD}}}fileIdentifier")
    SubElement(file_id, f"{{{GCO}}}CharacterString").text = metadata.file_identifier

    language = SubElement(root, f"{{{GMD}}}language")
    SubElement(language, f"{{{GCO}}}CharacterString").text = metadata.language

    date_stamp = SubElement(root, f"{{{GMD}}}dateStamp")
    SubElement(date_stamp, f"{{{GCO}}}DateTime").text = metadata.date_stamp.isoformat()

    # Contact information
    contact = SubElement(root, f"{{{GMD}}}contact")
    ci_resp = SubElement(contact, f"{{{GMD}}}CI_ResponsibleParty")
    if metadata.contact.individual_name:
        ind = SubElement(ci_resp, f"{{{GMD}}}individualName")
        SubElement(ind, f"{{{GCO}}}CharacterString").text = metadata.contact.individual_name
    if metadata.contact.organisation_name:
        org = SubElement(ci_resp, f"{{{GMD}}}organisationName")
        SubElement(org, f"{{{GCO}}}CharacterString").text = metadata.contact.organisation_name
    role = SubElement(ci_resp, f"{{{GMD}}}role")
    SubElement(role, f"{{{GCO}}}CharacterString").text = metadata.contact.role

    # Identification info
    ident_info = SubElement(root, f"{{{GMD}}}identificationInfo")
    md_data = SubElement(ident_info, f"{{{GMD}}}MD_DataIdentification")

    citation = SubElement(md_data, f"{{{GMD}}}citation")
    ci_citation = SubElement(citation, f"{{{GMD}}}CI_Citation")
    title = SubElement(ci_citation, f"{{{GMD}}}title")
    SubElement(title, f"{{{GCO}}}CharacterString").text = metadata.title

    abstract = SubElement(md_data, f"{{{GMD}}}abstract")
    SubElement(abstract, f"{{{GCO}}}CharacterString").text = metadata.abstract

    if metadata.purpose:
        purpose = SubElement(md_data, f"{{{GMD}}}purpose")
        SubElement(purpose, f"{{{GCO}}}CharacterString").text = metadata.purpose

    # Geographic extent
    extent = SubElement(md_data, f"{{{GMD}}}extent")
    ex_extent = SubElement(extent, f"{{{GMD}}}EX_Extent")
    geo_elem = SubElement(ex_extent, f"{{{GMD}}}geographicElement")
    bbox = SubElement(geo_elem, f"{{{GMD}}}EX_GeographicBoundingBox")

    west = SubElement(bbox, f"{{{GMD}}}westBoundLongitude")
    SubElement(west, f"{{{GCO}}}Decimal").text = str(metadata.geographic_element.west_bound_longitude)
    east = SubElement(bbox, f"{{{GMD}}}eastBoundLongitude")
    SubElement(east, f"{{{GCO}}}Decimal").text = str(metadata.geographic_element.east_bound_longitude)
    south = SubElement(bbox, f"{{{GMD}}}southBoundLatitude")
    SubElement(south, f"{{{GCO}}}Decimal").text = str(metadata.geographic_element.south_bound_latitude)
    north = SubElement(bbox, f"{{{GMD}}}northBoundLatitude")
    SubElement(north, f"{{{GCO}}}Decimal").text = str(metadata.geographic_element.north_bound_latitude)

    # Distribution info
    dist_info = SubElement(root, f"{{{GMD}}}distributionInfo")
    md_dist = SubElement(dist_info, f"{{{GMD}}}MD_Distribution")
    dist_format = SubElement(md_dist, f"{{{GMD}}}distributionFormat")
    md_format = SubElement(dist_format, f"{{{GMD}}}MD_Format")
    name = SubElement(md_format, f"{{{GMD}}}name")
    SubElement(name, f"{{{GCO}}}CharacterString").text = metadata.format_name
    if metadata.format_version:
        version = SubElement(md_format, f"{{{GMD}}}version")
        SubElement(version, f"{{{GCO}}}CharacterString").text = metadata.format_version

    return tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
