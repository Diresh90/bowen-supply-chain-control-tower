-- Historical FOB sea freight, FCL 40HC to Melbourne, monthly average USD per container, Jan 2025 – Nov 2026.
-- Source: FOB_40HC_Melbourne_rates_2025-2026.xlsx ("Monthly Rates" sheet). Port-to-port incl. BAF/PSS/restorations;
-- excludes Melbourne THC, port, customs and cartage. Nov 2026 is month to date.
-- Idempotent: re-running updates the same rows. Writes only to freight_rates. Locations are looked up, not created.
-- No exchange rate is in the source, so the AUD columns stay empty for these rows.
with source(origin_code, rate_month, usd_rate, note) as (values
  ('CNSHA','2025-01-01'::date,2900::numeric,'Estimated – Rates sliding from USD 4,290 (Wk44 2024) to a low in Wk2 2025, then up; DCN says Wk44 2025 (2,770) was the highest since Wk4 2025.'),
  ('CNNJG','2025-01-01'::date,3150::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-01-01'::date,2200::numeric,'Estimated – SE Asia–Australia benchmark USD 2000 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-02-01'::date,2200::numeric,'Estimated – DCN 21 Mar 2025: rates fell steadily from the last week of January (post-CNY).'),
  ('CNNJG','2025-02-01'::date,2450::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-02-01'::date,2100::numeric,'Estimated – SE Asia–Australia benchmark USD 1900 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-03-01'::date,1700::numeric,'Estimated – DCN 21 Mar 2025: rates reversed direction in Wk12 after the slide.'),
  ('CNNJG','2025-03-01'::date,1950::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-03-01'::date,2000::numeric,'Estimated – SE Asia–Australia benchmark USD 1800 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-04-01'::date,1800::numeric,'Estimated – No published weekly figure found; interpolated.'),
  ('CNNJG','2025-04-01'::date,2050::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-04-01'::date,2000::numeric,'Estimated – SE Asia–Australia benchmark USD 1800 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-05-01'::date,1750::numeric,'Estimated – No published weekly figure found; carriers announced GRIs for 15 June (Explorate, 28 May 2025).'),
  ('CNNJG','2025-05-01'::date,2000::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-05-01'::date,2050::numeric,'Estimated – SE Asia–Australia benchmark USD 1850 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-06-01'::date,1900::numeric,'Estimated – June GRIs (OOCL, ANL, ZIM USD 300/TEU); interpolated.'),
  ('CNNJG','2025-06-01'::date,2150::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-06-01'::date,2150::numeric,'Derived – SE Asia–Australia benchmark USD 1950 + USD 200 Indian Subcontinent premium. SE Asia spot USD 850–1,100/TEU for early June (Explorate, 28 May 2025), doubled to FEU.'),
  ('CNSHA','2025-07-01'::date,2050::numeric,'Estimated – DCN: ''upward creep of recent weeks'' leading into Wk31.'),
  ('CNNJG','2025-07-01'::date,2300::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-07-01'::date,2100::numeric,'Estimated – SE Asia–Australia benchmark USD 1900 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-08-01'::date,2150::numeric,'Reported – SCFI Wk31 USD 2,142/FEU (DCN, 6 Aug 2025).'),
  ('CNNJG','2025-08-01'::date,2400::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-08-01'::date,2050::numeric,'Estimated – SE Asia–Australia benchmark USD 1850 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-09-01'::date,2150::numeric,'Derived – Back-calculated: Wk41 ≈ 2,180 from Wk42–44 moves (+6%, +13%, +6%) to 2,770.'),
  ('CNNJG','2025-09-01'::date,2400::numeric,'Derived – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-09-01'::date,2000::numeric,'Estimated – SE Asia–Australia benchmark USD 1800 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-10-01'::date,2470::numeric,'Derived – Average of Wk41 ~2,180, Wk42 ~2,315, Wk43 ~2,615, Wk44 2,770 (DCN, 31 Oct 2025).'),
  ('CNNJG','2025-10-01'::date,2720::numeric,'Derived – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-10-01'::date,2000::numeric,'Estimated – SE Asia–Australia benchmark USD 1800 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2025-11-01'::date,3100::numeric,'Reported – SCFI Wk46 USD 3,238 (DCN, 14 Nov 2025); forwarder offers USD 2,900 Shanghai/Ningbo valid 15 Nov–14 Dec.'),
  ('CNNJG','2025-11-01'::date,3350::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-11-01'::date,2050::numeric,'Estimated – SE Asia–Australia benchmark USD 1850 + USD 200 Indian Subcontinent premium. ANL ISC/SE Asia restoration USD 600/FEU from 1 Nov 2025 (DCN).'),
  ('CNSHA','2025-12-01'::date,2900::numeric,'Estimated – Forwarder offers USD 2,900 to 14 Dec plus ANL USD 600/40'' from 1 Dec; Wk2 2026 ~2,875.'),
  ('CNNJG','2025-12-01'::date,3150::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2025-12-01'::date,1950::numeric,'Estimated – SE Asia–Australia benchmark USD 1750 + USD 200 Indian Subcontinent premium. No public figure; estimate.'),
  ('CNSHA','2026-01-01'::date,2300::numeric,'Estimated – Wk2 ~USD 2,875 (DCN: Wk23 2026 ''about USD 100 ahead'' of Wk2), then fell sharply before CNY.'),
  ('CNNJG','2026-01-01'::date,2550::numeric,'Estimated – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-01-01'::date,1850::numeric,'Estimated – SE Asia–Australia benchmark USD 1650 + USD 200 Indian Subcontinent premium. Xeneta SE Asia stable ±3% through early 2026 (DCN).'),
  ('CNSHA','2026-02-01'::date,1400::numeric,'Reported – SCFI Wk8–9 USD 1,376/FEU (DCN); spot offers below USD 1,000 (DCN, 3 Feb 2026).'),
  ('CNNJG','2026-02-01'::date,1650::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-02-01'::date,1830::numeric,'Derived – SE Asia–Australia benchmark USD 1630 + USD 200 Indian Subcontinent premium. Xeneta SE Asia ~USD 1,625–1,660 in Q1 2026 (DCN).'),
  ('CNSHA','2026-03-01'::date,1330::numeric,'Reported – SCFI Wk10 USD 1,420; Wk13 USD 1,242 (DCN).'),
  ('CNNJG','2026-03-01'::date,1580::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-03-01'::date,1840::numeric,'Derived – SE Asia–Australia benchmark USD 1640 + USD 200 Indian Subcontinent premium. Xeneta SE Asia ~USD 1,654 Wk13 (DCN).'),
  ('CNSHA','2026-04-01'::date,1650::numeric,'Reported – SCFI Wk14 USD 1,390 (DCN 2 Apr); Wk17 USD 2,028 (DCN 20 Apr 2026).'),
  ('CNNJG','2026-04-01'::date,1900::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-04-01'::date,1840::numeric,'Reported – SE Asia–Australia benchmark USD 1640 + USD 200 Indian Subcontinent premium. Xeneta Wk14 USD 1,658; Wk17 USD 1,625 (DCN).'),
  ('CNSHA','2026-05-01'::date,2450::numeric,'Reported – SCFI Wk21 USD 2,634 (Magellan Logistics, Jun 2026).'),
  ('CNNJG','2026-05-01'::date,2700::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-05-01'::date,1860::numeric,'Estimated – SE Asia–Australia benchmark USD 1660 + USD 200 Indian Subcontinent premium. Interpolated between Wk17 and Wk23.'),
  ('CNSHA','2026-06-01'::date,3300::numeric,'Derived – SCFI Wk23 USD 2,974 (DCN), rising toward Wk28 peak.'),
  ('CNNJG','2026-06-01'::date,3550::numeric,'Derived – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-06-01'::date,1886::numeric,'Reported – SE Asia–Australia benchmark USD 1686 + USD 200 Indian Subcontinent premium. Xeneta Wk23 USD 1,686 (DCN).'),
  ('CNSHA','2026-07-01'::date,4300::numeric,'Reported – SCFI Wk28 USD 4,558, YTD peak at the time (DCN, 11 Aug 2026).'),
  ('CNNJG','2026-07-01'::date,4550::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-07-01'::date,2600::numeric,'Estimated – SE Asia–Australia benchmark USD 2400 + USD 200 Indian Subcontinent premium. Interpolated; rates started rising in July.'),
  ('CNSHA','2026-08-01'::date,4400::numeric,'Reported – SCFI Wk33 USD 4,430 (DCN, 11 Aug 2026).'),
  ('CNNJG','2026-08-01'::date,4650::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-08-01'::date,3550::numeric,'Reported – SE Asia–Australia benchmark USD 3350 + USD 200 Indian Subcontinent premium. Xeneta Wk32 USD 3,069; Wk33 USD 3,635 (DCN, 11 Aug 2026).'),
  ('CNSHA','2026-09-01'::date,5500::numeric,'Reported – SCFI Wk38 ~USD 5,510 (Allwin Wk38); Wk39 USD 5,888 peak (DCN, 6 Nov 2026).'),
  ('CNNJG','2026-09-01'::date,5750::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-09-01'::date,4500::numeric,'Reported – SE Asia–Australia benchmark USD 4300 + USD 200 Indian Subcontinent premium. Xeneta Wk39 USD 4,567 (DCN, 6 Nov 2026); Wk38 area lower.'),
  ('CNSHA','2026-10-01'::date,5300::numeric,'Reported – Wk41 USD 5,524 (DCN 9 Oct); Wk42 fell 8%; Wk43–44 ~5,100 (DCN, 6 Nov 2026).'),
  ('CNNJG','2026-10-01'::date,5550::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab).'),
  ('NSA','2026-10-01'::date,4950::numeric,'Derived – SE Asia–Australia benchmark USD 4750 + USD 200 Indian Subcontinent premium. Wk39 4,567 then +0%, +3%, +1%, +4% (DCN, 6 Nov 2026).'),
  ('CNSHA','2026-11-01'::date,5050::numeric,'Reported – SCFI Wk45 USD 5,052/FEU (DCN, 6 Nov 2026). Month to date. Month to date (8 Nov 2026).'),
  ('CNNJG','2026-11-01'::date,5300::numeric,'Reported – Shanghai rate + USD 250 Nanjing feeder premium (Assumptions tab). Month to date (8 Nov 2026).'),
  ('NSA','2026-11-01'::date,5102::numeric,'Reported – SE Asia–Australia benchmark USD 4902 + USD 200 Indian Subcontinent premium. Xeneta Wk45 USD 4,902 (DCN, 6 Nov 2026). Month to date. Month to date (8 Nov 2026).')
), mapped as (
  select source.*,
    (select id from public.locations where lower(name) = case source.origin_code when 'CNNJG' then 'nanjing' when 'CNSHA' then 'shanghai' else 'nhava sheva / jnpt' end limit 1) as origin_id,
    (select id from public.locations where lower(name) = 'melbourne' and lower(country) = 'australia' limit 1) as destination_id
  from source
)
insert into public.freight_rates (
  rate_month, origin_location_id, origin_code, destination_location_id, container_type,
  sea_freight_rate_original, original_currency, fx_rate_to_aud, local_charges_aud,
  freight_forwarder_id, source_reference, notes
)
select rate_month, origin_id, origin_code, destination_id, '40HC', usd_rate, 'USD', null, null, null,
  'FOB_40HC_Melbourne_rates_2025-2026.xlsx', note
from mapped
on conflict (rate_month, origin_code, (coalesce(destination_location_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(container_type, '')), original_currency)
do update set
  origin_location_id = coalesce(excluded.origin_location_id, public.freight_rates.origin_location_id),
  sea_freight_rate_original = excluded.sea_freight_rate_original,
  source_reference = excluded.source_reference,
  notes = excluded.notes,
  updated_at = now();
