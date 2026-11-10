# Rocket shop

A propellant-tank shop for one tank. The player picks a material, a wall, a dome, a forming route, and a weld, then pressure-tests the tank. Stress, mass, and the pass/fail line all come from `src/` and are checked against hand-worked cases in `test/`.

```bash
npm test
npm run build
npm run dev
```

`npm run dev` opens the shop. The bay traveler’s mass, cost, yield, and burst are the core’s numbers at shop ambient (293.15 K), via `builderReadout`. The test stand sets the propellant, the operating pressure, and whether the wall is at that propellant temperature or at shop ambient. Proof and burst ramps, the heatmap, and the failure line come from `assessTank`. The forming bead and the 40× displacement are marked as visual, not as measured sizes.

The core is SI internally (pascals, meters, kelvin). The failure line is reported in psi because that is how the shop reads a gauge.

## What the model does

- Thin-wall membrane stress for a closed cylinder, a hemisphere, and a 2:1 elliptical head (crown and knuckle).
- von Mises for the metals. Maximum principal stress, tension and compression separately, for the quasi-isotropic IM7/8552 laminate.
- A transverse weld knockdown and a joint-efficiency multiplier. The efficiency stays at 1 when the knockdown already comes from a cross-weld coupon, so the coupon is not counted twice. The knockdown is applied to the stress that opens the seam: hoop on a longitudinal weld, axial on a girth weld.
- Proof factor 1.5 and burst factor 2.0 on MEOP, from the pressure-vessel rules in AIAA S-080-1998 with a chosen burst factor of 2.0.
- Strength at the test temperature from the anchors on the material card. 2195 uses the curve described by Niu et al. (2023) between 20 K and 298 K.
- Isotropic thermal contraction. Mass and a planning-cost roll-up.

Citations live in `src/sources.ts`. Nothing in that file is pasted from a datasheet.

## Simplifications

The number is only as good as this list.

- Membrane theory uses the inner radius. Discontinuity bending at the dome joint, knuckle buckling, and the Lamé distribution are not in the failure check. The Lamé inner-fiber hoop is reported only as a warning. Below R/t = 10 the result is not signable.
- Cylinder and domes share one thickness. One longitudinal seam. No residual stress, no weld mismatch, no fracture mechanics, no fatigue.
- Metals are compared elastically: von Mises against yield, then against ultimate. There is no plastic-instability (Faupel / Svensson) burst model. Radial stress is zero.
- The laminate does not use von Mises. There is no yield. Interlaminar strength is not on the card. The NCAMP means are normalized to a 0.0072 in cured ply and are not A-basis allowables. Cold-dry data stop at −65°F, which is not LOX temperature. A carbon tank at LOX or LCH4 temperature is not signable.
- Weld yield is set equal to the ultimate ratio when the coupon did not report yield. The 2219 TIG ratio is an author's "about 40%," transferred onto a different parent plate (NISTIR 3971, series 23B). The friction-stir ratio is one defect-free coupon, 340 MPa over that paper's 450 MPa parent.
- Strength parallel to the weld is left at the parent value. A real heat-affected zone is softer in that direction too, so a girth-only tank is credited with too much capacity.
- The room-temperature weld ratio is used at every temperature.
- 304L weld retention is assumed to be 1. There is no coupon.
- 2195, aged 718, and Ti-6Al-4V have no transverse coupon here. Those welds are not signable. Parent-metal numbers are still computed and labeled as such.
- 2195 between the measured endpoints follows the paper's description (linear yield, a stated ultimate–yield gap). It is not a test at 90 K.
- Outside a card's anchors the strength is clamped to the nearest anchor and the test is not signable. Isotropic contraction does not change R/t, so it does not change membrane stress. 2195 and the laminate have no coefficient of thermal expansion on the card. Modulus is the room-temperature value at every temperature.
- Ellipse mass is the mid-wall surface (both semi-axes grown by t/2) times thickness, not a true normal offset. Mass uses the room-temperature density and the as-built geometry.
- Dollars per kilogram and the process adders are shop planning figures, not prices and not physics.
- The 1.5 / 2.0 factors are the pressure-vessel pair. A launch-vehicle tank treated as a pressurized structure in the same standard can be held to a lower ultimate factor. That factor is not used here. The composite is held to the metallic pair as a shop rule.

## Materials

| Card | Strength used for pass/fail |
| --- | --- |
| 2219-T87 | NISTIR 3971, one longitudinal series |
| 2195-T8 | Niu et al. 2023, with the gap reconstruction |
| 304L | Kim et al. 2023 Table A2, the 10% Ni literature row, not their single specimen |
| Inconel 718, aged | Special Metals SMC-045 Table 20 |
| Ti-6Al-4V | TIMET Table 5 typical annealed plate, or typical aged sheet if solution treated and aged |
| IM7/8552 quasi-isotropic | NCAMP CAM-RP-2009-015 Rev B unnotched means |
