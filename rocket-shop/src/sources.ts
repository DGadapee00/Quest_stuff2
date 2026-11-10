export interface Source {
  id: string;
  title: string;
  url: string;
  /** What was taken, in our words. No pasted datasheet prose. */
  note: string;
}

export const sources: Record<string, Source> = {
  "kaiser-2219": {
    id: "kaiser-2219",
    title: "Kaiser Aluminum, Alloy 2219 sheet, coil and plate technical data, rev. 05/06",
    url: "https://online.kaiseraluminum.com/depot/PublicProductInformation/Document/1014/Kaiser_Aluminum_2219_Sheet_Coil_and_Plate.pdf",
    note: "Producer typicals for 2219-T87 longitudinal tension (69 ksi / 476 MPa ultimate, 57 ksi / 393 MPa yield, 10.6×10³ ksi / 73.1 GPa modulus), density 2.84 Mg/m³ at 20°C, mean CTE 22.5 µm/m·K from 20°C to 100°C, and the useful range −452°F to 600°F. Conductivity is printed for T351 (116 W/m·K) and T851 (130 W/m·K), not for T87. Arc weldability is rated A for the tempers whose rating row is printed, and the alloy is described as readily weldable. The strength-versus-temperature card does not use these room-temperature typicals; it uses the NIST series below. Kaiser is the source for modulus, density, expansion, the service range, and the T851 conductivity proxy.",
  },
  "nist-ir-3971": {
    id: "nist-ir-3971",
    title: "Simon, Drexler, and Reed, NISTIR 3971 (1991), Review of cryogenic mechanical and thermal properties of Al-Li alloys and Alloy 2219",
    url: "https://doi.org/10.6028/nist.ir.3971",
    note: "Public-domain survey. The 2219-T87 strength card is one longitudinal series on 12.7 mm rolled plate, reference 23B in that report, one test at each temperature: 300 K yield 388 MPa and ultimate 469 MPa; 77 K yield 470 MPa and ultimate 592 MPa; 20 K yield 476 MPa and ultimate 687 MPa. Poisson’s ratio 0.330 is the 2219-T87 elastic-constants row whose shear modulus is consistent with that Poisson ratio (E 77.4 GPa, G 29.1 GPa). That row’s modulus is not used; Kaiser’s 73.1 GPa is.",
  },
  "niu-2195-2023": {
    id: "niu-2195-2023",
    title: "Niu, Zhang, et al., Metals 13(4):740 (2023), Influence of cryogenic temperatures on 2195-T8",
    url: "https://doi.org/10.3390/met13040740",
    note: "Uniaxial tension on 15 mm 2195-T8 plate, rolling direction. The paper states 586 MPa yield and 614 MPa ultimate at 298 K, and 724 MPa yield and 859 MPa ultimate at 20 K. It describes yield as rising approximately linearly, ultimate as rising slowly above 133 K with the ultimate–yield gap staying about 30 MPa from 133 K to 298 K, and the gap widening below 133 K to 135 MPa at 20 K. The card reconstructs that description; it is not a digitization of their figure. The measured 298 K gap is 28 MPa, and the reconstruction uses 28 MPa so both measured endpoints are exact.",
  },
  "sam-2195": {
    id: "sam-2195",
    title: "Stanford Advanced Materials, aluminum-lithium alloy 2195 product page",
    url: "https://www.samaterials.com/aluminium/1774-2195-aluminum-lithium-alloy.html",
    note: "Supplier card used only for density 2.72 g/cm³ and elastic modulus 75 GPa. The same page lists T8 procurement minimums (ultimate at least 560 MPa, yield at least 500 MPa). Those minimums are not the failure card. The failure card is the Niu measurement, which sits above the minimums. Another supplier prints 0.096 lb/in³; that conflicting density is not used.",
  },
  "mil-hdbk-5j-aluminum-poisson": {
    id: "mil-hdbk-5j-aluminum-poisson",
    title: "MIL-HDBK-5J, 31 January 2003, metallic materials, aluminum alloy physical properties",
    url: "https://archive.org/details/milhdbk-5-j",
    note: "The handbook’s general aluminum physical-property tables use Poisson’s ratio 0.33. Edition J does not carry 2195. The 0.33 value is applied to 2195 as an aluminum-alloy assumption, not as a 2195 measurement.",
  },
  "upmet-304l": {
    id: "upmet-304l",
    title: "United Performance Metals, 304L stainless datasheet (AMS 5511 sheet, coil, and plate)",
    url: "https://www.upmet.com/sites/default/files/products/datasheet/304l-datasheet.pdf",
    note: "Density 8.03 g/cm³, tension modulus 29×10⁶ psi (printed as 200 GPa), mean CTE 16.6×10⁻⁶ /°C from 20°C to 100°C, conductivity 16.3 W/m·K at 100°C, and the mechanical table’s 304L figures 35 ksi (241 MPa) yield and 85 ksi (586 MPa) ultimate. Those room-temperature strengths are datasheet figures. The temperature card uses the cryogenic literature row below instead, so the failure model has one continuous strength curve.",
  },
  "kim-304l-2023": {
    id: "kim-304l-2023",
    title: "Kim et al., Metals 13(10):1774 (2023), Table A2, 304L with 10% nickel, cited there as reference 56",
    url: "https://doi.org/10.3390/met13101774",
    note: "Table A2 lists, for 304L with 10% Ni, 278 MPa yield and 716 MPa ultimate at 293 K, and 389 MPa yield and 1656 MPa ultimate at 77 K. The same paper’s own Table 2 is a single specimen (258 / 725 MPa at 300 K and 856 / 2172 MPa at 77 K) and the authors note it runs higher than earlier 304L results. That single specimen is not the card.",
  },
  "assumption-ss304l-poisson": {
    id: "assumption-ss304l-poisson",
    title: "Modeling assumption: Poisson’s ratio of annealed 304L",
    url: "https://www.upmet.com/sites/default/files/products/datasheet/304l-datasheet.pdf",
    note: "The UPMet sheet used for the other 304L room-temperature constants does not print Poisson’s ratio. The card uses 0.29, the usual value for annealed austenitic stainless. Strain output for 304L carries this assumption. It does not change the membrane stress.",
  },
  "assumption-ss304l-weld": {
    id: "assumption-ss304l-weld",
    title: "Modeling assumption: 304L transverse weld retention",
    url: "https://www.upmet.com/sites/default/files/products/datasheet/304l-datasheet.pdf",
    note: "304L is supplied annealed, so a fusion weld does not wipe out a precipitation temper. The card sets transverse yield and ultimate retention to 1. There is no cross-weld coupon in this dataset. A real matching-filler weld can sit a little above or below parent strength.",
  },
  "smc-045-inconel-718": {
    id: "smc-045-inconel-718",
    title: "Special Metals, INCONEL alloy 718, publication SMC-045 (September 2007)",
    url: "https://www.specialmetals.com/documents/technical-bulletins/inconel/inconel-alloy-718.pdf",
    note: "Aged density 0.297 lb/in³. Table 4, 70°F: Young’s modulus 29.0×10³ ksi and Poisson’s ratio 0.294. Table 5, aged conductivity 79 BTU·in/(h·ft²·°F) at 70°F, and mean expansion 5.9×10⁻⁶ /°F from 70°F to −320°F. Table 20, 5/8 in hot-rolled round, 1800°F/1 h anneal and the standard 1325°F age: at 80°F, 190.5 ksi ultimate and 153.5 ksi yield; at −320°F, 237.0 ksi ultimate and 173.5 ksi yield. The opening line gives a use range of −423°F to 1300°F. The bulletin calls the alloy readily fabricated and outstanding in resistance to post-weld cracking. No transverse weld-coupon strength from this bulletin is on the card.",
  },
  "timet-6-4-datasheet": {
    id: "timet-6-4-datasheet",
    title: "TIMET, TIMETAL 6-4 datasheet",
    url: "https://www.timet.com/documents/datasheets/alpha-and-beta-alloys/timetal-6-4.pdf",
    note: "Density 4.42 g/cm³ at 22°C, conductivity 6.6 W/m·K at 20°C, mean CTE 9.0×10⁻⁶ /K from 0°C to 100°C, Poisson’s ratio 0.31 at 20°C. Young’s modulus is given as the range 107–122 GPa at 20°C because of texture. The card uses the midpoint 114.5 GPa and says so. Reasonable properties are described as retained to about 350°C. The alloy is described as weldable if the joint is clean and shielded by inert gas or vacuum.",
  },
  "timet-6-4-manual": {
    id: "timet-6-4-manual",
    title: "TIMET, TIMETAL 6-4 properties manual, Table 5, mechanical properties of sheet and plate",
    url: "https://www.timet.com/assets/local/documents/technicalmanuals/TIMETAL_6-4_Properties.pdf",
    note: "Typical annealed plate (the fourth typical column, read as sheet annealed / sheet solution treated / sheet aged / plate annealed): ultimate 136 ksi, yield 128 ksi. Typical aged sheet (1000°F / 4 h): ultimate 168 ksi, yield 154 ksi. TIMET also prints rounded MPa beside those ksi figures. This card converts the ksi figures. The manual says annealed 6-4 keeps its ductility to liquid-nitrogen temperature but the extracted table does not give a cryogenic strength number, so none is used. ELI is recommended when toughness at cryogenic temperature matters; this card is standard grade.",
  },
  "ncamp-im7-8552": {
    id: "ncamp-im7-8552",
    title: "NIAR/NCAMP CAM-RP-2009-015 Rev B, Hexcel 8552/IM7 190 gsm 35% RC qualification (NPS 81228 M cure)",
    url: "https://www.wichita.edu/industry_and_defense/NIAR/Documents/Qual-CAM-RP-2009-015-Rev-B-Hexcel-8552-IM7-MPDR-04.16.19.pdf",
    note: "Quasi-isotropic laminate [45/0/−45/90]2s (25/50/25), normalized to a cured ply thickness of 0.0072 in. Unnotched tension means: 104.69 ksi and modulus 8.39 Msi at 70°F dry; 99.35 ksi and 8.35 Msi at −65°F dry. Unnotched compression mean 87.05 ksi at 70°F dry, Poisson’s ratio 0.334 at 70°F dry. Panel density 1.58 g/cm³ on the quasi-isotropic tension coupons (about 57.7% fiber by volume). Dry Tg 406.43°F by DMA. The 0° lamina tension mean in the same report is about 363 ksi, which is not the laminate strength and is not used as a tank allowable. CTD here is −65°F, not liquid-oxygen temperature. No 77 K strength is in this card. Elevated-temperature wet results are a different moisture condition and are not mixed in.",
  },
  "balaji-2219-weld-2013": {
    id: "balaji-2219-weld-2013",
    title: "Balaji and Mahapatra, Proc. IMechE Part B (2013), friction-stir welds of AA2219-T87 for a propellant tank",
    url: "https://doi.org/10.1177/0954405412462806",
    note: "Their 2219-T87 plate measured 360 MPa 0.2% proof and 450 MPa ultimate. They state that a fusion weld of 2219 in the T87 temper has a joint strength of only about 40% of the parent. That approximate ratio is the TIG card. A defect-free friction-stir butt weld in their Table 4 (300 mm/min, 3000 kgf, 400 r/min) reached 340 MPa ultimate. The friction-stir card uses 340/450. Ratios are transferred onto the NIST 23B parent, not the absolute stresses from this plate. The paper does not report weld yield, so yield retention is set equal to the ultimate ratio.",
  },
  "ntrs-2195-laser-1996": {
    id: "ntrs-2195-laser-1996",
    title: "NASA, Welding aluminum-lithium alloy 2195 for cryogenic tank applications (NTRS 19970003540)",
    url: "https://ntrs.nasa.gov/citations/19970003540",
    note: "Laser lap welds of 2195 cracked, and the parameter study in that report did not eliminate solidification cracking. Used here only as evidence that fusion welding of 2195 is crack-sensitive. No transverse ultimate from that report is used as a joint efficiency. Friction-stir welding of 2195 is the production route that grew out of that problem; this dataset still has no 2195 friction-stir coupon, so a 2195 weld is not signable.",
  },
  "aiaa-s-080-1998": {
    id: "aiaa-s-080-1998",
    title: "AIAA S-080-1998, Space systems — metallic pressure vessels, pressurized structures, and pressure components",
    url: "https://webstore.ansi.org/preview-pages/AIAA/preview_S-080-1998.pdf",
    note: "For metallic pressure vessels the standard’s minimum design burst factor is 1.5 (§§5.1.1.1 and 5.1.2.1). Proof pressure is 1.5×MEOP when the burst factor is 2.0 or greater, and (1+BF)/2×MEOP when it is lower. This shop selects a burst factor of 2.0, which sets the proof factor to 1.5. A launch-vehicle main tank treated as a pressurized structure under §5.2 can be held to a lower ultimate factor (1.25 uncrewed, 1.40 crewed). That structural factor is not what this pressure test uses. The same pair is applied to the composite tank as a shop rule; composite vessels are covered by a different standard.",
  },
  "nist-oxygen-nbp": {
    id: "nist-oxygen-nbp",
    title: "NIST Chemistry WebBook, oxygen, fluid properties",
    url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=C7782447&Mask=4",
    note: "Normal boiling point of oxygen. The propellant card uses 90.19 K for LOX at 1 atm.",
  },
  "nist-methane-nbp": {
    id: "nist-methane-nbp",
    title: "NIST Chemistry WebBook, methane, fluid properties",
    url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=C74828&Mask=4",
    note: "Normal boiling point of methane. The propellant card uses 111.66 K for LCH4 at 1 atm.",
  },
  "shop-ambient-rp1": {
    id: "shop-ambient-rp1",
    title: "Shop assumption: RP-1 test temperature",
    url: "",
    note: "RP-1 is a storable kerosene specification, not a pure cryogen. The test temperature is shop ambient, 293.15 K (20°C). It is not a boiling point.",
  },
  "shop-planning-cost": {
    id: "shop-planning-cost",
    title: "Shop planning prices and process adders",
    url: "",
    note: "Dollars per kilogram and the weld, forming, and heat-treatment adders are internal planning figures so the cost roll-up has a stable number. They are not mill quotes, not USGS commodity prices, and not physics. The tests lock the arithmetic, not the market.",
  },
  "model-weld-directional": {
    id: "model-weld-directional",
    title: "Model assumption: directional weld retention",
    url: "",
    note: "A cross-weld coupon measures strength across the joint. The card applies that ratio to the stress component that opens the weld (hoop for a longitudinal seam, axial for a girth seam). Strength parallel to the weld is left at the parent value. A real heat-affected zone is softer in every direction, so a girth-only tank is credited with more capacity than a fully softened band would allow. Joint efficiency is a separate multiplier and is 1 when the ratio already comes from a coupon, so the coupon is not discounted twice.",
  },
};

export function requireSource(id: string): Source {
  const source = sources[id];
  if (!source) {
    throw new Error(`Unknown source id: ${id}`);
  }
  return source;
}
