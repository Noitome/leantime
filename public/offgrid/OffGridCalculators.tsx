import React, { useEffect, useMemo, useState } from 'react';

type Voltage = 12 | 24 | 48;
type BatteryType = 'lead-acid' | 'agm' | 'lifepo4' | 'lithium-ion' | 'sodium-ion' | 'redox-flow';
type AltEnergyType = 'wind' | 'hydro' | 'thermal';
type WaterSource = 'rain' | 'bore' | 'dam' | 'atmospheric';
type WaterDelivery = 'gravity' | 'pump';
type WaterStorage = 'poly-cubes' | 'bladder' | 'hillside-dam' | 'concrete';
type WasteType = 'septic' | 'worm-farm' | 'composting-toilet' | 'biogas';

interface BatterySpec {
  dodStandard: 50 | 80 | 90 | 100;
  whPerKg: number;
  costPerAh: { min: number; max: number };
  notes: string;
}

interface BatterySizingInputs {
  dailyEnergyKWh: number;
  systemVoltage: Voltage;
  daysAutonomy: number;
  maxDOD: 50 | 80 | 90 | 100;
  temperature: 'hot' | 'moderate' | 'cold';
  batteryType: BatteryType;
  useRecommendedDOD: boolean;
}

interface InverterSizingInputs {
  continuousLoadWatts: number;
  largestApplianceWatts: number;
  surgeAppliances: ('well-pump' | 'fridge-compressor' | 'ac-startup' | 'power-tools')[];
  futureExpansion: 0 | 20 | 50;
  systemVoltage: Voltage;
}

interface Appliance {
  id: string;
  name: string;
  category: 'kitchen' | 'climate' | 'living' | 'laundry' | 'water' | 'lighting' | 'mobility' | 'workshop' | 'comms' | 'custom';
  watts: number;
  hoursPerDay: number;
  quantity: number;
  dutyCycle?: number;
}

const BATTERY_SPECS: Record<BatteryType, BatterySpec> = {
  'lead-acid': { dodStandard: 50, whPerKg: 35, costPerAh: { min: 6, max: 10 }, notes: 'Budget friendly, heavy, shortest cycle life.' },
  agm: { dodStandard: 50, whPerKg: 45, costPerAh: { min: 7, max: 11 }, notes: 'Sealed lead chemistry, moderate lifecycle.' },
  lifepo4: { dodStandard: 90, whPerKg: 110, costPerAh: { min: 9, max: 16 }, notes: 'Excellent cycle life, safer lithium chemistry.' },
  'lithium-ion': { dodStandard: 90, whPerKg: 150, costPerAh: { min: 10, max: 18 }, notes: 'Higher energy density, quality varies by BMS.' },
  'sodium-ion': { dodStandard: 90, whPerKg: 95, costPerAh: { min: 8, max: 14 }, notes: 'Emerging chemistry, no lithium/cobalt dependency.' },
  'redox-flow': { dodStandard: 100, whPerKg: 25, costPerAh: { min: 12, max: 22 }, notes: 'Very long life, bulky tanks, highly scalable.' },
};

const CITY_RAINFALL: Record<string, number> = {
  Sydney: 1213, Melbourne: 648, Brisbane: 1207, Perth: 721, Adelaide: 528, Darwin: 1729, Hobart: 616, Canberra: 629,
};

const appliancePresets: Appliance[] = [
  { id: 'fridge', name: 'Fridge', category: 'kitchen', watts: 150, hoursPerDay: 24, quantity: 1, dutyCycle: 0.6 },
  { id: 'freezer', name: 'Freezer', category: 'kitchen', watts: 200, hoursPerDay: 24, quantity: 0, dutyCycle: 0.5 },
  { id: 'deep-well-pump', name: 'Deep well pump', category: 'water', watts: 2200, hoursPerDay: 0.8, quantity: 0 },
  { id: 'starlink', name: 'Starlink terminal', category: 'comms', watts: 90, hoursPerDay: 24, quantity: 1 },
  { id: 'router', name: 'WiFi router', category: 'comms', watts: 20, hoursPerDay: 24, quantity: 1 },
  { id: 'ev-slow', name: 'EV charger (7kW)', category: 'mobility', watts: 7000, hoursPerDay: 2, quantity: 0 },
  { id: 'ev-fast', name: 'EV charger (11kW)', category: 'mobility', watts: 11000, hoursPerDay: 1, quantity: 0 },
  { id: 'welder-light', name: 'Welder (occasional light)', category: 'workshop', watts: 3500, hoursPerDay: 0.2, quantity: 0 },
  { id: 'welder-heavy', name: 'Welder (heavy fabrication)', category: 'workshop', watts: 7000, hoursPerDay: 2, quantity: 0 },
  { id: 'air-compressor', name: 'Workshop air compressor', category: 'workshop', watts: 1800, hoursPerDay: 1, quantity: 0 },
  { id: 'lathe', name: 'Lathe/mill', category: 'workshop', watts: 2500, hoursPerDay: 1, quantity: 0 },
  { id: 'tv', name: 'LED TV', category: 'living', watts: 100, hoursPerDay: 4, quantity: 1 },
  { id: 'laptop', name: 'Laptop', category: 'living', watts: 60, hoursPerDay: 6, quantity: 1 },
  { id: 'aircon', name: 'Air conditioner', category: 'climate', watts: 2500, hoursPerDay: 4, quantity: 0 },
  { id: 'led-bulbs', name: 'LED bulbs', category: 'lighting', watts: 10, hoursPerDay: 5, quantity: 10 },
  { id: 'water-pump', name: 'Pressure pump', category: 'water', watts: 800, hoursPerDay: 2, quantity: 0 },
];

const fmtAUD = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const r2 = (n: number) => Number(n.toFixed(2));

const OffGridCalculators: React.FC = () => {
  const [tab, setTab] = useState<'core' | 'alt' | 'water' | 'waste' | 'combined'>('core');
  const [battery, setBattery] = useState<BatterySizingInputs>({ dailyEnergyKWh: 15, systemVoltage: 48, daysAutonomy: 3, maxDOD: 90, temperature: 'moderate', batteryType: 'lifepo4', useRecommendedDOD: true });
  const [inverter, setInverter] = useState<InverterSizingInputs>({ continuousLoadWatts: 2000, largestApplianceWatts: 1500, surgeAppliances: [], futureExpansion: 20, systemVoltage: 48 });
  const [appliances, setAppliances] = useState<Appliance[]>(appliancePresets);
  const [rain, setRain] = useState({ roofAreaM2: 150, location: 'Sydney', customRainfall: 1000, householdSize: 4, dailyUsagePerPerson: 150, dryDaysStorage: 30, firstFlushDiverter: true, sourceType: 'rain' as WaterSource, deliveryMethod: 'pump' as WaterDelivery, storageType: 'poly-cubes' as WaterStorage });
  const [altEnergy, setAltEnergy] = useState({ wind: false, hydro: false, thermal: false, windKW: 2, hydroKW: 3, thermalKW: 1 });
  const [waste, setWaste] = useState({ septic: true, wormFarm: false, composting: false, biogas: false });
  const [roi, setROI] = useState({ systemSizeKW: 5, systemCost: 25000, quarterlyGridCost: 600, gridDistanceM: 500, dieselPricePerL: 2, generatorRuntimeHrs: 4 });
  const [solar, setSolar] = useState({ dailyEnergyKWh: 15, peakSunHours: 5, systemEfficiency: 75 as 70 | 75 | 80 | 85 });

  useEffect(() => {
    const recDod = BATTERY_SPECS[battery.batteryType].dodStandard;
    if (battery.useRecommendedDOD) setBattery((prev) => ({ ...prev, maxDOD: recDod }));
  }, [battery.batteryType, battery.useRecommendedDOD]);

  const batteryResult = useMemo(() => {
    const spec = BATTERY_SPECS[battery.batteryType];
    const dailyAh = (battery.dailyEnergyKWh * 1000) / battery.systemVoltage;
    const totalAhNeeded = dailyAh * battery.daysAutonomy;
    let batteryAh = totalAhNeeded / (battery.maxDOD / 100);
    if (battery.temperature === 'cold') batteryAh *= 1.2;
    if (battery.temperature === 'hot') batteryAh *= 0.95;
    const batteryKWh = (batteryAh * battery.systemVoltage) / 1000;
    const avgCost = (spec.costPerAh.min + spec.costPerAh.max) / 2;
    const weightKg = (batteryKWh * 1000) / spec.whPerKg;
    return {
      batteryAh, batteryKWh, weightKg,
      estimatedCost: { min: batteryAh * spec.costPerAh.min, max: batteryAh * spec.costPerAh.max, avg: batteryAh * avgCost },
    };
  }, [battery]);

  const inverterResult = useMemo(() => {
    const surgeMultipliers: Record<string, number> = { 'well-pump': 3, 'fridge-compressor': 2, 'ac-startup': 2.5, 'power-tools': 1.5 };
    let surgeMultiplier = 1.2;
    inverter.surgeAppliances.forEach((a) => { surgeMultiplier = Math.max(surgeMultiplier, surgeMultipliers[a]); });
    const surgeWatts = inverter.largestApplianceWatts * surgeMultiplier;
    const peakLoad = inverter.continuousLoadWatts + (surgeWatts - inverter.largestApplianceWatts);
    const futureAdjusted = peakLoad * (1 + inverter.futureExpansion / 100);
    const minimumWatts = futureAdjusted * 1.1;
    const recommendedVA = minimumWatts / 0.9;
    return { minimumWatts, recommendedVA };
  }, [inverter]);

  const loadResult = useMemo(() => {
    const totalDailyKWh = appliances.reduce((s, a) => s + ((a.watts * a.hoursPerDay * a.quantity * (a.dutyCycle ?? 1)) / 1000), 0);
    const adjustedPeak = appliances.reduce((s, a) => s + a.watts * a.quantity, 0) * 0.7;
    return { totalDailyKWh, adjustedPeak };
  }, [appliances]);

  const solarResult = useMemo(() => {
    const actualEnergyNeeded = solar.dailyEnergyKWh / (solar.systemEfficiency / 100);
    const solarWatts = (actualEnergyNeeded / solar.peakSunHours) * 1000; // fixed unit conversion
    const recommendedWatts = solarWatts * 1.2;
    const dailyProductionKWh = (recommendedWatts * solar.peakSunHours) / 1000;
    return { recommendedWatts, dailyProductionKWh, panelCount: Math.ceil(recommendedWatts / 400) };
  }, [solar]);

  const waterResult = useMemo(() => {
    const annualRainfall = rain.location === 'Custom' ? rain.customRainfall : CITY_RAINFALL[rain.location] || 1000;
    let efficiency = 0.85;
    if (rain.firstFlushDiverter) efficiency -= 0.05;
    let annualCollection = (rain.roofAreaM2 * annualRainfall * efficiency) / 1000;
    if (rain.sourceType === 'bore') annualCollection += 180000;
    if (rain.sourceType === 'dam') annualCollection += 240000;
    if (rain.sourceType === 'atmospheric') annualCollection += 55000;
    const dailyUsageTotal = rain.householdSize * rain.dailyUsagePerPerson;
    const annualUsage = dailyUsageTotal * 365;
    let recommendedTank = dailyUsageTotal * rain.dryDaysStorage * 1.2;
    if (annualCollection < annualUsage) recommendedTank *= 1.5;
    const filtration = rain.sourceType === 'bore' ? 'Sediment + iron/manganese + UV' : rain.sourceType === 'dam' ? 'Sediment + activated carbon + UV/chlorination' : rain.sourceType === 'atmospheric' ? 'Remineralisation + UV polish' : 'Sediment + carbon + UV';
    return { annualCollection, annualUsage, recommendedTank, filtration };
  }, [rain]);

  const altEnergyResult = useMemo(() => {
    const windKWh = altEnergy.wind ? altEnergy.windKW * 24 * 0.3 : 0;
    const hydroKWh = altEnergy.hydro ? altEnergy.hydroKW * 24 * 0.6 : 0;
    const thermalKWh = altEnergy.thermal ? altEnergy.thermalKW * 24 * 0.4 : 0;
    return { totalAltDailyKWh: windKWh + hydroKWh + thermalKWh, windKWh, hydroKWh, thermalKWh };
  }, [altEnergy]);

  const wasteResult = useMemo(() => {
    const selected: WasteType[] = [];
    if (waste.septic) selected.push('septic');
    if (waste.wormFarm) selected.push('worm-farm');
    if (waste.composting) selected.push('composting-toilet');
    if (waste.biogas) selected.push('biogas');
    const annualCost = selected.reduce((s, w) => s + (w === 'septic' ? 450 : w === 'biogas' ? 700 : 220), 0);
    return { selected, annualCost };
  }, [waste]);

  const combined = useMemo(() => {
    const baseLoad = loadResult.totalDailyKWh || solar.dailyEnergyKWh;
    const netLoad = Math.max(0, baseLoad - altEnergyResult.totalAltDailyKWh);
    return {
      netLoad,
      altContribution: altEnergyResult.totalAltDailyKWh,
      batteryAh: batteryResult.batteryAh,
      batteryWeight: batteryResult.weightKg,
      batteryCost: batteryResult.estimatedCost.avg,
      inverterKW: Math.ceil(inverterResult.minimumWatts / 1000),
      solarW: solarResult.recommendedWatts,
      waterL: waterResult.recommendedTank,
      wasteAnnual: wasteResult.annualCost,
    };
  }, [loadResult.totalDailyKWh, solar.dailyEnergyKWh, altEnergyResult.totalAltDailyKWh, batteryResult, inverterResult.minimumWatts, solarResult.recommendedWatts, waterResult.recommendedTank, wasteResult.annualCost]);

  const batteryComparison = (Object.keys(BATTERY_SPECS) as BatteryType[]).map((t) => {
    const spec = BATTERY_SPECS[t];
    const dailyAh = (battery.dailyEnergyKWh * 1000) / battery.systemVoltage;
    let ah = (dailyAh * battery.daysAutonomy) / (spec.dodStandard / 100);
    if (battery.temperature === 'cold') ah *= 1.2;
    if (battery.temperature === 'hot') ah *= 0.95;
    const kWh = (ah * battery.systemVoltage) / 1000;
    return { type: t, ah, costMin: ah * spec.costPerAh.min, costMax: ah * spec.costPerAh.max, weight: (kWh * 1000) / spec.whPerKg, dod: spec.dodStandard };
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <h1 className="text-3xl font-bold">⚡ Off-Grid Master Plan Calculators</h1>
      <div className="flex flex-wrap gap-2">
        {(['core', 'alt', 'water', 'waste', 'combined'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded ${tab === t ? 'bg-blue-700 text-white' : 'bg-gray-200'}`}>{t.toUpperCase()}</button>)}
      </div>

      {tab === 'core' && <>
        <section className="bg-white shadow rounded p-4 space-y-3">
          <h2 className="text-xl font-semibold">🔋 Battery Bank Sizing</h2>
          <p className="text-sm">Chemistry-aware depth-of-discharge with cost + weight outputs.</p>
          <div className="grid md:grid-cols-4 gap-3">
            <input type="number" min={1} max={50} value={battery.dailyEnergyKWh} onChange={(e) => setBattery({ ...battery, dailyEnergyKWh: Number(e.target.value) })} className="border p-2 rounded" placeholder="Daily kWh" />
            <select value={battery.systemVoltage} onChange={(e) => setBattery({ ...battery, systemVoltage: Number(e.target.value) as Voltage })} className="border p-2 rounded"><option value={12}>12V</option><option value={24}>24V</option><option value={48}>48V</option></select>
            <input type="number" min={1} max={5} value={battery.daysAutonomy} onChange={(e) => setBattery({ ...battery, daysAutonomy: Number(e.target.value) })} className="border p-2 rounded" placeholder="Days" />
            <select value={battery.temperature} onChange={(e) => setBattery({ ...battery, temperature: e.target.value as 'hot' | 'moderate' | 'cold' })} className="border p-2 rounded"><option value="hot">Hot</option><option value="moderate">Moderate</option><option value="cold">Cold</option></select>
            <select value={battery.batteryType} onChange={(e) => setBattery({ ...battery, batteryType: e.target.value as BatteryType })} className="border p-2 rounded md:col-span-2">
              <option value="lead-acid">Lead Acid</option><option value="agm">AGM</option><option value="lifepo4">LiFePO4</option><option value="lithium-ion">Lithium-ion</option><option value="sodium-ion">Sodium-ion</option><option value="redox-flow">Redox Flow</option>
            </select>
            <label className="flex items-center gap-2"><input type="checkbox" checked={battery.useRecommendedDOD} onChange={(e) => setBattery({ ...battery, useRecommendedDOD: e.target.checked })} />Use chemistry DOD ({BATTERY_SPECS[battery.batteryType].dodStandard}%)</label>
            <select disabled={battery.useRecommendedDOD} value={battery.maxDOD} onChange={(e) => setBattery({ ...battery, maxDOD: Number(e.target.value) as 50 | 80 | 90 | 100 })} className="border p-2 rounded"><option value={50}>50%</option><option value={80}>80%</option><option value={90}>90%</option><option value={100}>100%</option></select>
          </div>
          <p>Need <b>{r2(batteryResult.batteryAh)} Ah</b> @ {battery.systemVoltage}V ({r2(batteryResult.batteryKWh)} kWh), approx <b>{Math.round(batteryResult.weightKg)} kg</b>.</p>
          <p>Estimated cost: {fmtAUD(batteryResult.estimatedCost.min)} - {fmtAUD(batteryResult.estimatedCost.max)}</p>
          <p className="text-sm">{BATTERY_SPECS[battery.batteryType].notes}</p>
          <div className="overflow-auto">
            <table className="w-full text-sm border"><thead><tr className="bg-gray-100"><th className="border p-1">Type</th><th className="border p-1">Std DOD</th><th className="border p-1">Capacity Ah</th><th className="border p-1">Weight kg</th><th className="border p-1">Cost Range AUD</th></tr></thead><tbody>
              {batteryComparison.map((r) => <tr key={r.type}><td className="border p-1">{r.type}</td><td className="border p-1">{r.dod}%</td><td className="border p-1">{r2(r.ah)}</td><td className="border p-1">{Math.round(r.weight)}</td><td className="border p-1">{fmtAUD(r.costMin)} - {fmtAUD(r.costMax)}</td></tr>)}
            </tbody></table>
          </div>
        </section>

        <hr />
        <section className="bg-white shadow rounded p-4 space-y-3">
          <h2 className="text-xl font-semibold">🔌 Solar + Inverter + Appliance Load</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <input type="number" value={inverter.continuousLoadWatts} onChange={(e) => setInverter({ ...inverter, continuousLoadWatts: Number(e.target.value) })} className="border p-2 rounded" placeholder="Continuous W" />
            <input type="number" value={inverter.largestApplianceWatts} onChange={(e) => setInverter({ ...inverter, largestApplianceWatts: Number(e.target.value) })} className="border p-2 rounded" placeholder="Largest W" />
            <select value={inverter.futureExpansion} onChange={(e) => setInverter({ ...inverter, futureExpansion: Number(e.target.value) as 0 | 20 | 50 })} className="border p-2 rounded"><option value={0}>0%</option><option value={20}>20%</option><option value={50}>50%</option></select>
          </div>
          <p>Inverter minimum: <b>{Math.ceil(inverterResult.minimumWatts / 1000)}kW</b> ({r2(inverterResult.recommendedVA)}VA)</p>

          <div className="grid md:grid-cols-3 gap-3">
            <input type="number" value={solar.dailyEnergyKWh} onChange={(e) => setSolar({ ...solar, dailyEnergyKWh: Number(e.target.value) })} className="border p-2 rounded" placeholder="Daily kWh" />
            <input type="range" min={3} max={7} step={0.5} value={solar.peakSunHours} onChange={(e) => setSolar({ ...solar, peakSunHours: Number(e.target.value) })} />
            <select value={solar.systemEfficiency} onChange={(e) => setSolar({ ...solar, systemEfficiency: Number(e.target.value) as 70 | 75 | 80 | 85 })} className="border p-2 rounded"><option value={70}>70%</option><option value={75}>75%</option><option value={80}>80%</option><option value={85}>85%</option></select>
          </div>
          <p>☀️ Solar array needed: <b>{Math.round(solarResult.recommendedWatts)}W</b> ({solarResult.panelCount} x 400W panels)</p>

          <div className="grid md:grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
            {appliances.map((a) => <div key={a.id} className="flex justify-between"><span>{a.name}</span><div className="flex gap-2"><button onClick={() => setAppliances((p) => p.map((x) => x.id === a.id ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x))}>-</button><b>{a.quantity}</b><button onClick={() => setAppliances((p) => p.map((x) => x.id === a.id ? { ...x, quantity: x.quantity + 1 } : x))}>+</button></div></div>)}
          </div>
          <p>Load total: <b>{r2(loadResult.totalDailyKWh)} kWh/day</b>, adjusted peak {Math.round(loadResult.adjustedPeak)}W</p>
        </section>
      </>}

      {tab === 'alt' && <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">🌬️ Alt Energy (Side-stream)</h2>
        <p className="text-sm">Toggle wind/hydro/thermal and see contribution to final system summary.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <label>🌪️ <input type="checkbox" checked={altEnergy.wind} onChange={(e) => setAltEnergy({ ...altEnergy, wind: e.target.checked })} /> Wind <input type="number" value={altEnergy.windKW} onChange={(e) => setAltEnergy({ ...altEnergy, windKW: Number(e.target.value) })} className="border p-1 w-20" />kW</label>
          <label>💧 <input type="checkbox" checked={altEnergy.hydro} onChange={(e) => setAltEnergy({ ...altEnergy, hydro: e.target.checked })} /> Hydro <input type="number" value={altEnergy.hydroKW} onChange={(e) => setAltEnergy({ ...altEnergy, hydroKW: Number(e.target.value) })} className="border p-1 w-20" />kW</label>
          <label>🔥 <input type="checkbox" checked={altEnergy.thermal} onChange={(e) => setAltEnergy({ ...altEnergy, thermal: e.target.checked })} /> Thermal <input type="number" value={altEnergy.thermalKW} onChange={(e) => setAltEnergy({ ...altEnergy, thermalKW: Number(e.target.value) })} className="border p-1 w-20" />kW</label>
        </div>
        <p>Alt contribution: <b>{r2(altEnergyResult.totalAltDailyKWh)} kWh/day</b> (Wind {r2(altEnergyResult.windKWh)} | Hydro {r2(altEnergyResult.hydroKWh)} | Thermal {r2(altEnergyResult.thermalKWh)})</p>
      </section>}

      {tab === 'water' && <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">💧 Water (Phase 5 Expanded)</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <select value={rain.sourceType} onChange={(e) => setRain({ ...rain, sourceType: e.target.value as WaterSource })} className="border p-2 rounded"><option value="rain">Rain Catchment</option><option value="bore">Bore</option><option value="dam">Dam/Surface</option><option value="atmospheric">Atmospheric Water Generator</option></select>
          <select value={rain.deliveryMethod} onChange={(e) => setRain({ ...rain, deliveryMethod: e.target.value as WaterDelivery })} className="border p-2 rounded"><option value="gravity">Gravity-fed</option><option value="pump">Pump-fed</option></select>
          <select value={rain.storageType} onChange={(e) => setRain({ ...rain, storageType: e.target.value as WaterStorage })} className="border p-2 rounded"><option value="poly-cubes">Poly cubes</option><option value="bladder">Bladder tank</option><option value="hillside-dam">Hillside dam</option><option value="concrete">Concrete tank</option></select>
          <select value={rain.location} onChange={(e) => setRain({ ...rain, location: e.target.value })} className="border p-2 rounded"><option>Sydney</option><option>Melbourne</option><option>Brisbane</option><option>Perth</option><option>Adelaide</option><option>Darwin</option><option>Hobart</option><option>Canberra</option><option>Custom</option></select>
        </div>
        <p>Recommended storage: <b>{Math.round(waterResult.recommendedTank)} L</b> via {rain.storageType}, delivery: {rain.deliveryMethod}.</p>
        <p>Filtration train: <b>{waterResult.filtration}</b></p>
      </section>}

      {tab === 'waste' && <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">♻️ Waste & Sanitation</h2>
        <div className="grid md:grid-cols-2 gap-2">
          <label><input type="checkbox" checked={waste.septic} onChange={(e) => setWaste({ ...waste, septic: e.target.checked })} /> Septic/Taylex style</label>
          <label><input type="checkbox" checked={waste.wormFarm} onChange={(e) => setWaste({ ...waste, wormFarm: e.target.checked })} /> Worm farm treatment</label>
          <label><input type="checkbox" checked={waste.composting} onChange={(e) => setWaste({ ...waste, composting: e.target.checked })} /> Composting toilet</label>
          <label><input type="checkbox" checked={waste.biogas} onChange={(e) => setWaste({ ...waste, biogas: e.target.checked })} /> Biogas digester</label>
        </div>
        <p>Selected systems: <b>{wasteResult.selected.join(', ') || 'none'}</b></p>
        <p>Annual maintenance estimate: <b>{fmtAUD(wasteResult.annualCost)}</b></p>
      </section>}

      {tab === 'combined' && <section className="bg-green-50 border border-green-300 rounded p-4 space-y-2">
        <h2 className="text-xl font-semibold">🧠 Combined Master Plan</h2>
        <p>Net daily load after Alt Energy: <b>{r2(combined.netLoad)} kWh/day</b> (Alt contribution {r2(combined.altContribution)} kWh/day)</p>
        <p>Solar: <b>{Math.round(combined.solarW)}W</b> | Inverter: <b>{combined.inverterKW}kW</b></p>
        <p>Battery: <b>{r2(combined.batteryAh)}Ah</b> (~{Math.round(combined.batteryWeight)}kg, avg {fmtAUD(combined.batteryCost)})</p>
        <p>Water storage: <b>{Math.round(combined.waterL)}L</b> | Waste annual maintenance: <b>{fmtAUD(combined.wasteAnnual)}</b></p>
      </section>}
    </div>
  );
};

export default OffGridCalculators;
