import React, { useEffect, useMemo, useState } from 'react';

type Voltage = 12 | 24 | 48;

interface BatterySizingInputs {
  dailyEnergyKWh: number;
  systemVoltage: Voltage;
  daysAutonomy: number;
  maxDOD: 50 | 80 | 90 | 100;
  temperature: 'hot' | 'moderate' | 'cold';
  batteryType: 'lead-acid' | 'agm' | 'lifepo4' | 'lithium-ion';
}

interface BatterySizingResult {
  batteryAh: number;
  batteryKWh: number;
  batteries12V: number;
  batteries24V: number;
  seriesStrings: number;
  estimatedCost: { min: number; max: number };
  runtimeHours: { critical: number; normal: number; heavy: number };
}

interface InverterSizingInputs {
  continuousLoadWatts: number;
  largestApplianceWatts: number;
  surgeAppliances: ('well-pump' | 'fridge-compressor' | 'ac-startup' | 'power-tools')[];
  futureExpansion: 0 | 20 | 50;
  inverterType: 'pure-sine' | 'modified-sine';
  systemVoltage: Voltage;
}

interface InverterSizingResult {
  minimumWatts: number;
  recommendedVA: number;
  peakSurgeWatts: number;
  maxAmpsDC: number;
  wireSizeAWG: number;
  fuseSizeAmps: number;
  options: {
    budget: { watts: number; price: number };
    mid: { watts: number; price: number };
    premium: { watts: number; price: number };
  };
}

interface Appliance {
  id: string;
  name: string;
  category: 'kitchen' | 'climate' | 'living' | 'laundry' | 'water' | 'lighting' | 'custom';
  watts: number;
  hoursPerDay: number;
  quantity: number;
  dutyCycle?: number;
}

interface RainwaterInputs {
  roofAreaM2: number;
  location: string;
  customRainfall?: number;
  householdSize: number;
  dailyUsagePerPerson: number;
  dryDaysStorage: number;
  firstFlushDiverter: boolean;
}

interface ROIInputs {
  systemSizeKW: number;
  systemCost: number;
  quarterlyGridCost: number;
  gridDistanceM: number;
  dieselPricePerL: number;
  generatorRuntimeHrs: number;
}

interface SolarSizingInputs {
  dailyEnergyKWh: number;
  peakSunHours: number;
  systemEfficiency: 70 | 75 | 80 | 85;
  daysAutonomy: number;
  budgetRange: 'budget' | 'mid' | 'premium';
}

const fmtAUD = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const round2 = (n: number) => Number(n.toFixed(2));

const CITY_RAINFALL: Record<string, number> = {
  Sydney: 1213, Melbourne: 648, Brisbane: 1207, Perth: 721, Adelaide: 528, Darwin: 1729, Hobart: 616, Canberra: 629,
};

const appliancePresets: Appliance[] = [
  { id: 'fridge', name: 'Fridge (12V/240V)', category: 'kitchen', watts: 150, hoursPerDay: 24, quantity: 1, dutyCycle: 0.6 },
  { id: 'freezer', name: 'Freezer', category: 'kitchen', watts: 200, hoursPerDay: 24, quantity: 0, dutyCycle: 0.5 },
  { id: 'microwave', name: 'Microwave', category: 'kitchen', watts: 1200, hoursPerDay: 0.5, quantity: 0 },
  { id: 'kettle', name: 'Kettle', category: 'kitchen', watts: 2000, hoursPerDay: 0.5, quantity: 0 },
  { id: 'coffee-maker', name: 'Coffee maker', category: 'kitchen', watts: 800, hoursPerDay: 0.5, quantity: 0 },
  { id: 'toaster', name: 'Toaster', category: 'kitchen', watts: 1000, hoursPerDay: 0.3, quantity: 0 },
  { id: 'rice-cooker', name: 'Rice cooker', category: 'kitchen', watts: 700, hoursPerDay: 1, quantity: 0 },
  { id: 'dishwasher', name: 'Dishwasher', category: 'kitchen', watts: 1800, hoursPerDay: 1, quantity: 0 },
  { id: 'blender', name: 'Blender', category: 'kitchen', watts: 500, hoursPerDay: 0.2, quantity: 0 },
  { id: 'rangehood', name: 'Rangehood', category: 'kitchen', watts: 120, hoursPerDay: 1, quantity: 0 },
  { id: 'aircon', name: 'Air conditioner', category: 'climate', watts: 2500, hoursPerDay: 4, quantity: 0 },
  { id: 'ceiling-fan', name: 'Ceiling fan', category: 'climate', watts: 75, hoursPerDay: 8, quantity: 1 },
  { id: 'heater', name: 'Heater (electric)', category: 'climate', watts: 2000, hoursPerDay: 4, quantity: 0 },
  { id: 'evap-cooler', name: 'Evaporative cooler', category: 'climate', watts: 400, hoursPerDay: 6, quantity: 0 },
  { id: 'dehumidifier', name: 'Dehumidifier', category: 'climate', watts: 350, hoursPerDay: 5, quantity: 0 },
  { id: 'electric-blanket', name: 'Electric blanket', category: 'climate', watts: 120, hoursPerDay: 8, quantity: 0 },
  { id: 'humidifier', name: 'Humidifier', category: 'climate', watts: 40, hoursPerDay: 8, quantity: 0 },
  { id: 'tv', name: 'LED TV', category: 'living', watts: 100, hoursPerDay: 4, quantity: 1 },
  { id: 'laptop', name: 'Laptop', category: 'living', watts: 60, hoursPerDay: 6, quantity: 1 },
  { id: 'phone', name: 'Phone charger', category: 'living', watts: 10, hoursPerDay: 3, quantity: 2 },
  { id: 'router', name: 'WiFi router', category: 'living', watts: 20, hoursPerDay: 24, quantity: 1 },
  { id: 'gaming-pc', name: 'Gaming PC', category: 'living', watts: 450, hoursPerDay: 3, quantity: 0 },
  { id: 'speaker', name: 'Sound system', category: 'living', watts: 150, hoursPerDay: 2, quantity: 0 },
  { id: 'monitor', name: 'External monitor', category: 'living', watts: 35, hoursPerDay: 8, quantity: 0 },
  { id: 'console', name: 'Game console', category: 'living', watts: 180, hoursPerDay: 2, quantity: 0 },
  { id: 'printer', name: 'Printer', category: 'living', watts: 100, hoursPerDay: 1, quantity: 0 },
  { id: 'cctv', name: 'CCTV system', category: 'living', watts: 40, hoursPerDay: 24, quantity: 0 },
  { id: 'washer', name: 'Washing machine', category: 'laundry', watts: 500, hoursPerDay: 1, quantity: 0 },
  { id: 'dryer', name: 'Dryer', category: 'laundry', watts: 3000, hoursPerDay: 0.5, quantity: 0 },
  { id: 'iron', name: 'Iron', category: 'laundry', watts: 1200, hoursPerDay: 0.5, quantity: 0 },
  { id: 'vacuum', name: 'Vacuum cleaner', category: 'laundry', watts: 1000, hoursPerDay: 0.5, quantity: 0 },
  { id: 'water-pump', name: 'Water pump', category: 'water', watts: 800, hoursPerDay: 2, quantity: 0 },
  { id: 'bore-pump', name: 'Bore pump', category: 'water', watts: 1500, hoursPerDay: 1, quantity: 0 },
  { id: 'filtration', name: 'Water filtration system', category: 'water', watts: 90, hoursPerDay: 4, quantity: 0 },
  { id: 'hot-water', name: 'Hot water circulation', category: 'water', watts: 250, hoursPerDay: 2, quantity: 0 },
  { id: 'irrigation', name: 'Irrigation pump', category: 'water', watts: 1000, hoursPerDay: 1, quantity: 0 },
  { id: 'led-bulbs', name: 'LED bulbs (count)', category: 'lighting', watts: 10, hoursPerDay: 5, quantity: 10 },
  { id: 'outdoor-led', name: 'Outdoor LED flood', category: 'lighting', watts: 30, hoursPerDay: 4, quantity: 0 },
  { id: 'shed-light', name: 'Shed/workshop lights', category: 'lighting', watts: 40, hoursPerDay: 3, quantity: 0 },
  { id: 'security-light', name: 'Security lights', category: 'lighting', watts: 15, hoursPerDay: 10, quantity: 0 },
  { id: 'bathroom-fan', name: 'Bathroom fan', category: 'living', watts: 35, hoursPerDay: 2, quantity: 0 },
  { id: 'door-motor', name: 'Garage door motor', category: 'living', watts: 350, hoursPerDay: 0.2, quantity: 0 },
  { id: 'treadmill', name: 'Treadmill', category: 'living', watts: 700, hoursPerDay: 0.5, quantity: 0 },
  { id: 'cpap', name: 'CPAP machine', category: 'living', watts: 60, hoursPerDay: 8, quantity: 0 },
  { id: 'fish-tank', name: 'Fish tank pump/heater', category: 'living', watts: 120, hoursPerDay: 12, quantity: 0 },
  { id: 'drone-charge', name: 'Drone battery charger', category: 'living', watts: 150, hoursPerDay: 1, quantity: 0 },
  { id: 'workbench-tools', name: 'Workbench power tools', category: 'living', watts: 1200, hoursPerDay: 0.7, quantity: 0 },
  { id: 'air-purifier', name: 'Air purifier', category: 'climate', watts: 65, hoursPerDay: 12, quantity: 0 },
  { id: 'baby-warmer', name: 'Baby bottle warmer', category: 'kitchen', watts: 300, hoursPerDay: 0.6, quantity: 0 },
  { id: 'medical-fridge', name: 'Medical mini-fridge', category: 'kitchen', watts: 80, hoursPerDay: 24, quantity: 0, dutyCycle: 0.5 },
  { id: 'pool-pump', name: 'Small pool pump', category: 'water', watts: 1100, hoursPerDay: 2, quantity: 0 },
  { id: 'uv-sterilizer', name: 'UV sterilizer', category: 'water', watts: 55, hoursPerDay: 12, quantity: 0 },
  { id: 'greenhouse-fan', name: 'Greenhouse fan', category: 'climate', watts: 90, hoursPerDay: 6, quantity: 0 },
  { id: 'security-system', name: 'Security alarm panel', category: 'living', watts: 25, hoursPerDay: 24, quantity: 0 },
];

function getWireSizeAWG(amps: number): number {
  if (amps <= 10) return 14;
  if (amps <= 20) return 12;
  if (amps <= 30) return 10;
  if (amps <= 50) return 8;
  if (amps <= 80) return 6;
  if (amps <= 100) return 4;
  return 2;
}

const OffGridCalculators: React.FC = () => {
  const [battery, setBattery] = useState<BatterySizingInputs>({ dailyEnergyKWh: 15, systemVoltage: 48, daysAutonomy: 3, maxDOD: 80, temperature: 'moderate', batteryType: 'lifepo4' });
  const [inverter, setInverter] = useState<InverterSizingInputs>({ continuousLoadWatts: 2000, largestApplianceWatts: 1500, surgeAppliances: [], futureExpansion: 20, inverterType: 'pure-sine', systemVoltage: 48 });
  const [appliances, setAppliances] = useState<Appliance[]>(appliancePresets);
  const [rain, setRain] = useState<RainwaterInputs>({ roofAreaM2: 150, location: 'Sydney', householdSize: 4, dailyUsagePerPerson: 150, dryDaysStorage: 30, firstFlushDiverter: true });
  const [roi, setROI] = useState<ROIInputs>({ systemSizeKW: 5, systemCost: 25000, quarterlyGridCost: 600, gridDistanceM: 500, dieselPricePerL: 2, generatorRuntimeHrs: 4 });
  const [solar, setSolar] = useState<SolarSizingInputs>({ dailyEnergyKWh: 15, peakSunHours: 5, systemEfficiency: 75, daysAutonomy: 3, budgetRange: 'mid' });
  const [customName, setCustomName] = useState('');
  const [customWatts, setCustomWatts] = useState(200);
  const [customHours, setCustomHours] = useState(2);
  const [customQty, setCustomQty] = useState(1);

  useEffect(() => {
    document.title = 'Off-Grid Calculators | Off Grid Master Plan';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Off-grid calculators for batteries, inverter, appliance loads, rainwater, ROI, and solar sizing.');
  }, []);

  const batteryResult = useMemo<BatterySizingResult>(() => {
    const dailyAh = (battery.dailyEnergyKWh * 1000) / battery.systemVoltage;
    const totalAhNeeded = dailyAh * battery.daysAutonomy;
    let batteryAh = totalAhNeeded / (battery.maxDOD / 100);
    if (battery.temperature === 'cold') batteryAh *= 1.2;
    if (battery.temperature === 'hot') batteryAh *= 0.95;
    const batteryKWh = (batteryAh * battery.systemVoltage) / 1000;
    return {
      batteryAh,
      batteryKWh,
      batteries12V: Math.ceil(batteryAh / 200),
      batteries24V: Math.ceil(batteryAh / 100),
      seriesStrings: battery.systemVoltage / 12,
      estimatedCost: { min: batteryAh * 8, max: batteryAh * 15 },
      runtimeHours: { critical: batteryKWh / 0.5, normal: batteryKWh / 1.5, heavy: batteryKWh / 3 },
    };
  }, [battery]);

  const inverterResult = useMemo<InverterSizingResult>(() => {
    const surgeMultipliers: Record<string, number> = { 'well-pump': 3, 'fridge-compressor': 2, 'ac-startup': 2.5, 'power-tools': 1.5 };
    let surgeMultiplier = 1.2;
    inverter.surgeAppliances.forEach((a) => { surgeMultiplier = Math.max(surgeMultiplier, surgeMultipliers[a]); });
    const surgeWatts = inverter.largestApplianceWatts * surgeMultiplier;
    const peakLoad = inverter.continuousLoadWatts + (surgeWatts - inverter.largestApplianceWatts);
    const futureAdjusted = peakLoad * (1 + inverter.futureExpansion / 100);
    const minimumWatts = futureAdjusted * 1.1;
    const recommendedVA = minimumWatts / 0.9;
    const maxAmpsDC = recommendedVA / inverter.systemVoltage;
    return {
      minimumWatts,
      recommendedVA,
      peakSurgeWatts: surgeWatts,
      maxAmpsDC,
      wireSizeAWG: getWireSizeAWG(maxAmpsDC),
      fuseSizeAmps: Math.ceil(maxAmpsDC * 1.25),
      options: {
        budget: { watts: minimumWatts, price: minimumWatts * 0.8 },
        mid: { watts: recommendedVA * 0.9, price: recommendedVA * 1.2 },
        premium: { watts: recommendedVA * 1.1, price: recommendedVA * 2.5 },
      },
    };
  }, [inverter]);

  const loadResult = useMemo(() => {
    const totalDailyKWh = appliances.reduce((s, a) => s + ((a.watts * a.hoursPerDay * a.quantity * (a.dutyCycle ?? 1)) / 1000), 0);
    const peakWatts = appliances.reduce((s, a) => s + (a.watts * a.quantity), 0);
    const adjustedPeakWatts = peakWatts * 0.7;
    const categoryMap: Record<string, number> = {};
    appliances.forEach((a) => {
      const kWh = (a.watts * a.hoursPerDay * a.quantity * (a.dutyCycle ?? 1)) / 1000;
      categoryMap[a.category] = (categoryMap[a.category] || 0) + kWh;
    });
    return {
      totalDailyKWh,
      peakWatts,
      adjustedPeakWatts,
      inverterSizeNeeded: Math.ceil(adjustedPeakWatts / 1000),
      generatorSizeNeeded: Math.ceil((adjustedPeakWatts * 1.2) / 1000),
      categoryMap,
    };
  }, [appliances]);

  const rainResult = useMemo(() => {
    const annualRainfall = rain.location === 'Custom' ? (rain.customRainfall || 1000) : CITY_RAINFALL[rain.location] || 1000;
    let efficiency = 0.85;
    if (rain.firstFlushDiverter) efficiency -= 0.05;
    const annualCollection = (rain.roofAreaM2 * annualRainfall * efficiency) / 1000;
    const dailyUsageTotal = rain.householdSize * rain.dailyUsagePerPerson;
    const annualUsage = dailyUsageTotal * 365;
    const drySeasonRequirement = dailyUsageTotal * rain.dryDaysStorage;
    let recommendedTankSize = drySeasonRequirement * 1.2;
    const warnings: string[] = [];
    if (annualCollection < annualUsage) {
      warnings.push('Collection insufficient - reduce usage or supplement');
      recommendedTankSize *= 1.5;
    }
    if (annualCollection < annualUsage * 0.5) warnings.push('Not enough rainfall for self-sufficiency');
    if (rain.roofAreaM2 < 50) warnings.push('Small roof area - supplement with additional catchment');
    if (rain.location === 'Darwin') warnings.push('Tropical wet/dry pattern - maximize dry season storage');
    const summerCollection = annualCollection * 0.15;
    const winterCollection = annualCollection * 0.35;
    const seasonalUsage = dailyUsageTotal * 90;
    const tankOptions = [
      { size: Math.round(recommendedTankSize), type: 'Poly (round)', cost: recommendedTankSize * 0.8 },
      { size: Math.round(recommendedTankSize * 1.5), type: 'Poly (slimline)', cost: recommendedTankSize * 1.2 },
      { size: Math.round(recommendedTankSize * 2), type: 'Concrete', cost: recommendedTankSize * 1.5 },
    ].map((t) => ({ ...t, fillTimeDays: Math.ceil(t.size / ((rain.roofAreaM2 * 5 * efficiency) / 1000 || 1)) }));
    return { annualCollection, annualUsage, dailyUsageTotal, recommendedTankSize, warnings, summerCollection, winterCollection, seasonalUsage, collectionPer1mm: (rain.roofAreaM2 * efficiency), tankOptions };
  }, [rain]);

  const roiResult = useMemo(() => {
    let gridConnectionCost = 0;
    if (roi.gridDistanceM > 100) {
      if (roi.gridDistanceM <= 500) gridConnectionCost = roi.gridDistanceM * 50;
      else if (roi.gridDistanceM <= 1000) gridConnectionCost = 25000 + (roi.gridDistanceM - 500) * 40;
      else gridConnectionCost = 45000 + (roi.gridDistanceM - 1000) * 30;
    }
    const annualProduction = roi.systemSizeKW * 5 * 365 * 0.8;
    const generatorFuelPerHour = 3.5;
    const dailyFuelCost = generatorFuelPerHour * roi.dieselPricePerL * roi.generatorRuntimeHrs;
    const annualGeneratorCost = dailyFuelCost * 365 + 2000;
    const annualGridCost = roi.quarterlyGridCost * 4;
    const totalGridCost25yr = annualGridCost * ((Math.pow(1.05, 25) - 1) / 0.05);
    const annualMaintenance = roi.systemCost * 0.01;
    const totalMaintenance25yr = annualMaintenance * 25;
    const batteryReplacementCost = roi.systemCost * 0.3;
    const totalSolarCost25yr = roi.systemCost + batteryReplacementCost + totalMaintenance25yr;
    const annualSavings = annualGridCost - annualMaintenance;
    const simplePayback = roi.systemCost / annualSavings;
    const adjustedPayback = (roi.systemCost + batteryReplacementCost) / annualSavings;
    const netSavings25yr = (totalGridCost25yr + gridConnectionCost) - totalSolarCost25yr;
    const roiPercent = (netSavings25yr / roi.systemCost) * 100;
    const co2SavedVsGrid = annualProduction * 0.8;
    const co2SavedVsDiesel = generatorFuelPerHour * roi.generatorRuntimeHrs * 2.68 * 365;
    return { gridConnectionCost, annualGridCost, annualGeneratorCost, totalGridCost25yr, totalSolarCost25yr, totalGeneratorCost25yr: 5000 + annualGeneratorCost * 25, annualMaintenance, annualSavings, simplePayback, adjustedPayback, netSavings25yr, roiPercent, breakEvenMonth: Math.ceil(adjustedPayback * 12), co2SavedVsGrid, co2SavedVsDiesel, treesEquivalent: Math.round(co2SavedVsGrid / 21) };
  }, [roi]);

  const solarResult = useMemo(() => {
    const actualEnergyNeeded = solar.dailyEnergyKWh / (solar.systemEfficiency / 100);
    const solarWatts = actualEnergyNeeded / solar.peakSunHours;
    const recommendedWatts = solarWatts * 1.2;
    const dailyProductionKWh = (recommendedWatts * solar.peakSunHours) / 1000;
    return {
      recommendedWatts,
      panelCount: Math.ceil(recommendedWatts / 400),
      estimatedCost: { min: recommendedWatts * 1.5, max: recommendedWatts * 3 },
      roofSpaceSqm: recommendedWatts / 20,
      dailyProductionKWh,
      isViable: dailyProductionKWh >= solar.dailyEnergyKWh,
    };
  }, [solar]);

  const addCustomAppliance = () => {
    if (!customName.trim()) return;
    setAppliances((prev) => [...prev, { id: `custom-${Date.now()}`, name: customName.trim(), category: 'custom', watts: customWatts, hoursPerDay: customHours, quantity: customQty }]);
    setCustomName('');
  };

  const saveProfile = () => localStorage.setItem('offgrid-appliance-profile', JSON.stringify(appliances));
  const loadProfile = () => {
    const raw = localStorage.getItem('offgrid-appliance-profile');
    if (raw) setAppliances(JSON.parse(raw));
  };

  const combined = {
    dailyEnergyKWh: round2(loadResult.totalDailyKWh || solar.dailyEnergyKWh),
    recommendedSolarWatts: round2(((loadResult.totalDailyKWh || solar.dailyEnergyKWh) / (solar.systemEfficiency / 100) / solar.peakSunHours) * 1.2),
    recommendedBatteryAh: round2(batteryResult.batteryAh),
    inverterKW: Math.ceil(inverterResult.minimumWatts / 1000),
    rainTankL: Math.round(rainResult.recommendedTankSize),
    paybackYrs: round2(roiResult.adjustedPayback),
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Off-Grid Master Plan Calculators</h1>

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">1) Battery Bank Sizing Calculator</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input type="number" min={1} max={50} value={battery.dailyEnergyKWh} onChange={(e) => setBattery({ ...battery, dailyEnergyKWh: Number(e.target.value) })} placeholder="Daily kWh" className="border p-2 rounded" />
          <select value={battery.systemVoltage} onChange={(e) => setBattery({ ...battery, systemVoltage: Number(e.target.value) as Voltage })} className="border p-2 rounded"><option value={12}>12V</option><option value={24}>24V</option><option value={48}>48V</option></select>
          <input type="number" min={1} max={5} value={battery.daysAutonomy} onChange={(e) => setBattery({ ...battery, daysAutonomy: Number(e.target.value) })} placeholder="Days autonomy" className="border p-2 rounded" />
          <select value={battery.maxDOD} onChange={(e) => setBattery({ ...battery, maxDOD: Number(e.target.value) as 50 | 80 | 90 | 100 })} className="border p-2 rounded"><option value={50}>50%</option><option value={80}>80%</option><option value={90}>90%</option><option value={100}>100%</option></select>
          <select value={battery.temperature} onChange={(e) => setBattery({ ...battery, temperature: e.target.value as 'hot' | 'moderate' | 'cold' })} className="border p-2 rounded"><option value="hot">Hot (&gt;35°C)</option><option value="moderate">Moderate</option><option value="cold">Cold (&lt;5°C)</option></select>
          <select value={battery.batteryType} onChange={(e) => setBattery({ ...battery, batteryType: e.target.value as BatterySizingInputs['batteryType'] })} className="border p-2 rounded"><option value="lead-acid">Lead Acid</option><option value="agm">AGM</option><option value="lifepo4">LiFePO4</option><option value="lithium-ion">Lithium-ion</option></select>
        </div>
        <p>You need approximately <b>{round2(batteryResult.batteryAh)} Ah</b> at <b>{battery.systemVoltage}V</b> ({round2(batteryResult.batteryKWh)} kWh)</p>
        <p>12V parallel: {batteryResult.batteries12V} | 24V parallel: {batteryResult.batteries24V} | series strings: {batteryResult.seriesStrings} | cost: {fmtAUD(batteryResult.estimatedCost.min)} - {fmtAUD(batteryResult.estimatedCost.max)}</p>
        <p>Runtime (critical/normal/heavy): {round2(batteryResult.runtimeHours.critical)}h / {round2(batteryResult.runtimeHours.normal)}h / {round2(batteryResult.runtimeHours.heavy)}h</p>
        {battery.maxDOD > 80 && battery.batteryType === 'lead-acid' && <p className="text-amber-700">Deep discharge reduces lead-acid battery lifespan</p>}
        {battery.systemVoltage === 12 && battery.dailyEnergyKWh > 10 && <p className="text-blue-700">Consider 24V or 48V system for lower current/losses</p>}
      </section>

      <hr />

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">2) Inverter Sizing Calculator</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input type="number" min={100} max={15000} value={inverter.continuousLoadWatts} onChange={(e) => setInverter({ ...inverter, continuousLoadWatts: Number(e.target.value) })} className="border p-2 rounded" placeholder="Continuous load W" />
          <input type="number" min={100} max={10000} value={inverter.largestApplianceWatts} onChange={(e) => setInverter({ ...inverter, largestApplianceWatts: Number(e.target.value) })} className="border p-2 rounded" placeholder="Largest appliance W" />
          <select value={inverter.futureExpansion} onChange={(e) => setInverter({ ...inverter, futureExpansion: Number(e.target.value) as 0 | 20 | 50 })} className="border p-2 rounded"><option value={0}>0%</option><option value={20}>20%</option><option value={50}>50%</option></select>
        </div>
        <div className="flex flex-wrap gap-3">
          {(['well-pump', 'fridge-compressor', 'ac-startup', 'power-tools'] as const).map((k) => <label key={k}><input type="checkbox" checked={inverter.surgeAppliances.includes(k)} onChange={() => setInverter({ ...inverter, surgeAppliances: inverter.surgeAppliances.includes(k) ? inverter.surgeAppliances.filter((x) => x !== k) : [...inverter.surgeAppliances, k] })} /> {k}</label>)}
        </div>
        <p>Minimum inverter: <b>{Math.ceil(inverterResult.minimumWatts / 1000)}kW</b> ({round2(inverterResult.recommendedVA)}VA)</p>
        <p>DC current: {round2(inverterResult.maxAmpsDC)}A | AWG {inverterResult.wireSizeAWG} | Fuse: {inverterResult.fuseSizeAmps}A</p>
        <p>Budget/Mid/Premium prices: {fmtAUD(inverterResult.options.budget.price)} / {fmtAUD(inverterResult.options.mid.price)} / {fmtAUD(inverterResult.options.premium.price)}</p>
        {inverterResult.minimumWatts > 8000 && <p className="text-amber-700">Consider split-phase or multiple inverters</p>}
        {inverter.systemVoltage === 12 && inverterResult.minimumWatts > 2000 && <p className="text-red-700">12V systems limited to 2kW</p>}
      </section>

      <hr />

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">3) Appliance Load Calculator</h2>
        <div className="flex gap-2"><button onClick={saveProfile} className="px-3 py-1 bg-gray-200 rounded">Save Profile</button><button onClick={loadProfile} className="px-3 py-1 bg-gray-200 rounded">Load Profile</button></div>
        <div className="grid md:grid-cols-2 gap-2 max-h-80 overflow-auto">
          {appliances.map((a) => <div key={a.id} className="border rounded p-2 flex justify-between items-center"><span>{a.name}</span><div className="flex gap-2 items-center"><button onClick={() => setAppliances((p) => p.map((x) => x.id === a.id ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x))}>-</button><b>{a.quantity}</b><button onClick={() => setAppliances((p) => p.map((x) => x.id === a.id ? { ...x, quantity: x.quantity + 1 } : x))}>+</button></div></div>)}
        </div>
        <div className="grid md:grid-cols-4 gap-2"><input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom appliance" className="border p-2 rounded" /><input type="number" value={customWatts} onChange={(e) => setCustomWatts(Number(e.target.value))} className="border p-2 rounded" /><input type="number" value={customHours} onChange={(e) => setCustomHours(Number(e.target.value))} className="border p-2 rounded" /><input type="number" value={customQty} onChange={(e) => setCustomQty(Number(e.target.value))} className="border p-2 rounded" /></div>
        <button onClick={addCustomAppliance} className="px-3 py-1 bg-blue-600 text-white rounded">Add Custom Appliance</button>
        <p>Your estimated daily consumption: <b>{round2(loadResult.totalDailyKWh)} kWh</b></p>
        <p>Simultaneous peak: {round2(loadResult.adjustedPeakWatts)}W | Inverter: {loadResult.inverterSizeNeeded}kW | Generator: {loadResult.generatorSizeNeeded}kW</p>
      </section>

      <hr />

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">4) Rainwater Harvesting Calculator</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input type="number" min={20} max={1000} value={rain.roofAreaM2} onChange={(e) => setRain({ ...rain, roofAreaM2: Number(e.target.value) })} className="border p-2 rounded" placeholder="Roof area m²" />
          <select value={rain.location} onChange={(e) => setRain({ ...rain, location: e.target.value })} className="border p-2 rounded"><option>Sydney</option><option>Melbourne</option><option>Brisbane</option><option>Perth</option><option>Adelaide</option><option>Darwin</option><option>Hobart</option><option>Canberra</option><option>Custom</option></select>
          {rain.location === 'Custom' && <input type="number" min={200} max={3000} value={rain.customRainfall || 1000} onChange={(e) => setRain({ ...rain, customRainfall: Number(e.target.value) })} className="border p-2 rounded" placeholder="Rainfall mm" />}
          <input type="number" min={1} max={10} value={rain.householdSize} onChange={(e) => setRain({ ...rain, householdSize: Number(e.target.value) })} className="border p-2 rounded" placeholder="Household size" />
          <input type="number" min={50} max={300} value={rain.dailyUsagePerPerson} onChange={(e) => setRain({ ...rain, dailyUsagePerPerson: Number(e.target.value) })} className="border p-2 rounded" placeholder="L/person/day" />
          <input type="number" min={7} max={90} value={rain.dryDaysStorage} onChange={(e) => setRain({ ...rain, dryDaysStorage: Number(e.target.value) })} className="border p-2 rounded" placeholder="Dry days" />
        </div>
        <label><input type="checkbox" checked={rain.firstFlushDiverter} onChange={(e) => setRain({ ...rain, firstFlushDiverter: e.target.checked })} /> First flush diverter</label>
        <p>Recommended tank size: <b>{Math.round(rainResult.recommendedTankSize)} litres</b> ({round2(rainResult.recommendedTankSize / 1000)}kL)</p>
        <p>Annual collection: {Math.round(rainResult.annualCollection)}L | Annual usage: {Math.round(rainResult.annualUsage)}L | Surplus/Deficit: {Math.round(rainResult.annualCollection - rainResult.annualUsage)}L</p>
        {rainResult.warnings.map((w) => <p key={w} className="text-amber-700">{w}</p>)}
      </section>

      <hr />

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">5) Off-Grid Solar ROI Calculator</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input type="number" min={1} max={20} value={roi.systemSizeKW} onChange={(e) => setROI({ ...roi, systemSizeKW: Number(e.target.value) })} className="border p-2 rounded" placeholder="System kW" />
          <input type="number" min={5000} max={100000} value={roi.systemCost} onChange={(e) => setROI({ ...roi, systemCost: Number(e.target.value) })} className="border p-2 rounded" placeholder="System cost" />
          <input type="number" min={100} max={2000} value={roi.quarterlyGridCost} onChange={(e) => setROI({ ...roi, quarterlyGridCost: Number(e.target.value) })} className="border p-2 rounded" placeholder="Grid $/quarter" />
          <input type="number" min={0} max={5000} value={roi.gridDistanceM} onChange={(e) => setROI({ ...roi, gridDistanceM: Number(e.target.value) })} className="border p-2 rounded" placeholder="Grid distance m" />
          <input type="number" step={0.01} min={1.5} max={3} value={roi.dieselPricePerL} onChange={(e) => setROI({ ...roi, dieselPricePerL: Number(e.target.value) })} className="border p-2 rounded" placeholder="Diesel $/L" />
          <input type="number" min={0} max={24} value={roi.generatorRuntimeHrs} onChange={(e) => setROI({ ...roi, generatorRuntimeHrs: Number(e.target.value) })} className="border p-2 rounded" placeholder="Generator hrs/day" />
        </div>
        <p>Payback period: <b>{round2(roiResult.adjustedPayback)} years</b> | 25-year savings: <b>{fmtAUD(roiResult.netSavings25yr)}</b></p>
        <p>Simple payback: {round2(roiResult.simplePayback)}y | ROI: {round2(roiResult.roiPercent)}% | Break-even month: {roiResult.breakEvenMonth}</p>
        <p>CO2 saved vs grid: {Math.round(roiResult.co2SavedVsGrid)}kg/yr | trees equivalent: {roiResult.treesEquivalent}/yr</p>
      </section>

      <hr />

      <section className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">6) Solar Panel Sizing Calculator</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input type="number" min={1} max={100} value={solar.dailyEnergyKWh} onChange={(e) => setSolar({ ...solar, dailyEnergyKWh: Number(e.target.value) })} className="border p-2 rounded" placeholder="Daily kWh" />
          <input type="range" min={3} max={7} step={0.5} value={solar.peakSunHours} onChange={(e) => setSolar({ ...solar, peakSunHours: Number(e.target.value) })} className="w-full" />
          <select value={solar.systemEfficiency} onChange={(e) => setSolar({ ...solar, systemEfficiency: Number(e.target.value) as 70 | 75 | 80 | 85 })} className="border p-2 rounded"><option value={70}>70%</option><option value={75}>75%</option><option value={80}>80%</option><option value={85}>85%</option></select>
        </div>
        <p>You need approximately <b>{round2(solarResult.recommendedWatts)} watts</b> of solar panels</p>
        <p>Panels: {solarResult.panelCount} | Cost: {fmtAUD(solarResult.estimatedCost.min)} - {fmtAUD(solarResult.estimatedCost.max)} | Roof: {round2(solarResult.roofSpaceSqm)} m²</p>
        <p>Off-grid viability: {solarResult.isViable ? '✓ Sufficient' : '⚠ Insufficient'}</p>
      </section>

      <hr />

      <section className="bg-green-50 border border-green-300 rounded p-4 space-y-2">
        <h2 className="text-xl font-semibold">Combined Master Plan (Best Attempt)</h2>
        <p>Daily load basis: <b>{combined.dailyEnergyKWh} kWh/day</b></p>
        <p>Solar array: <b>{combined.recommendedSolarWatts} W</b> | Battery bank: <b>{combined.recommendedBatteryAh} Ah @ {battery.systemVoltage}V</b> | Inverter: <b>{combined.inverterKW} kW</b></p>
        <p>Rainwater tank: <b>{combined.rainTankL} L</b> | Financial payback: <b>{combined.paybackYrs} years</b></p>
        <p className="text-sm">Affiliate placeholders: <a href="/affiliate/panels/budget">Budget Panels</a> · <a href="/affiliate/panels/mid">Mid Panels</a> · <a href="/affiliate/panels/premium">Premium Panels</a></p>
      </section>
    </div>
  );
};

export default OffGridCalculators;
