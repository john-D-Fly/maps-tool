import type { PresetPlace } from '../types';
import { createUFCampusFeature, createNUAIRCorridor } from './geo';

export const PRESET_PLACES: PresetPlace[] = [
  // ── CUAS / Protected Sites ───────────────────────────────────────
  { name: 'Mar-a-Lago', category: 'cuas', searchQuery: 'Mar-a-Lago Palm Beach Florida', description: '~17 acres' },
  { name: 'The White House', category: 'cuas', osmId: 19761182, osmType: 'relation', description: '~18 acres complex' },
  { name: 'Pentagon', category: 'cuas', searchQuery: 'The Pentagon Arlington Virginia', description: '~34 acres' },
  { name: 'US Capitol Building', category: 'cuas', searchQuery: 'United States Capitol Building Washington DC', description: 'Capitol grounds' },
  { name: 'Camp David', category: 'cuas', searchQuery: 'Camp David Thurmont Maryland', description: 'Presidential retreat' },
  { name: 'Buckingham Palace', category: 'cuas', searchQuery: 'Buckingham Palace London', description: 'Royal residence' },
  { name: 'Kremlin', category: 'cuas', searchQuery: 'Moscow Kremlin', description: '68 acres' },
  { name: 'Élysée Palace', category: 'cuas', searchQuery: 'Élysée Palace Paris', description: 'French presidency' },
  { name: 'Gatwick Airport', category: 'cuas', osmId: 1307077, osmType: 'relation', description: '2018 drone shutdown' },
  { name: 'Newark Liberty Airport', category: 'cuas', searchQuery: 'Newark Liberty International Airport', description: 'Drone incidents' },
  { name: 'Heathrow Airport', category: 'cuas', searchQuery: 'Heathrow Airport London', description: 'CUAS perimeter' },
  { name: 'Joint Base Andrews', category: 'cuas', searchQuery: 'Joint Base Andrews Maryland', description: 'Air Force One base' },
  { name: 'Area 51', category: 'cuas', searchQuery: 'Groom Lake Nevada Test Site', description: 'Restricted airspace' },
  { name: 'NSA Fort Meade', category: 'cuas', searchQuery: 'Fort George G Meade Maryland', description: 'NSA HQ' },

  // ── Stadiums & Arenas ────────────────────────────────────────────
  { name: 'MetLife Stadium', category: 'stadium', searchQuery: 'MetLife Stadium East Rutherford New Jersey', description: 'NFL Giants/Jets, 82K seats' },
  { name: 'SoFi Stadium', category: 'stadium', searchQuery: 'SoFi Stadium Inglewood California', description: 'NFL Rams/Chargers' },
  { name: 'Allegiant Stadium', category: 'stadium', searchQuery: 'Allegiant Stadium Las Vegas', description: 'NFL Raiders, Super Bowl' },
  { name: 'Hard Rock Stadium', category: 'stadium', searchQuery: 'Hard Rock Stadium Miami Gardens Florida', description: 'NFL Dolphins, Super Bowl' },
  { name: 'AT&T Stadium', category: 'stadium', searchQuery: 'AT&T Stadium Arlington Texas', description: 'NFL Cowboys, 80K seats' },
  { name: 'Mercedes-Benz Stadium', category: 'stadium', searchQuery: 'Mercedes-Benz Stadium Atlanta Georgia', description: 'NFL Falcons, Super Bowl' },
  { name: 'Lumen Field', category: 'stadium', searchQuery: 'Lumen Field Seattle Washington', description: 'NFL Seahawks' },
  { name: 'Gillette Stadium', category: 'stadium', searchQuery: 'Gillette Stadium Foxborough Massachusetts', description: 'NFL Patriots' },
  { name: 'Caesars Superdome', category: 'stadium', searchQuery: 'Caesars Superdome New Orleans Louisiana', description: 'NFL Saints, Super Bowl' },
  { name: 'Michigan Stadium', category: 'stadium', searchQuery: 'Michigan Stadium Ann Arbor', description: 'Largest US stadium, 107K' },
  { name: 'Rose Bowl', category: 'stadium', searchQuery: 'Rose Bowl Stadium Pasadena California', description: 'NCAA, 88K seats' },
  { name: 'Wembley Stadium', category: 'stadium', searchQuery: 'Wembley Stadium London', description: 'UK national, 90K seats' },
  { name: 'Stade de France', category: 'stadium', searchQuery: 'Stade de France Saint-Denis', description: 'Olympics 2024, 81K' },
  { name: 'Camp Nou', category: 'stadium', searchQuery: 'Camp Nou Barcelona', description: 'FC Barcelona, 99K seats' },
  { name: 'Maracanã', category: 'stadium', searchQuery: 'Maracanã Stadium Rio de Janeiro', description: 'FIFA World Cup, 78K' },

  // ── Landmarks / Special Areas ────────────────────────────────────
  { name: 'UF Campus', category: 'landmark', geojson: createUFCampusFeature(), description: 'University of Florida' },
  { name: 'Central Park', category: 'landmark', osmId: 2552070, osmType: 'relation', description: '1.3 sq mi' },
  { name: 'Yellowstone NP', category: 'landmark', osmId: 1453306, osmType: 'relation', description: '3,471 sq mi' },
  { name: 'Walt Disney World', category: 'landmark', osmId: 10675745, osmType: 'relation', description: '25 sq mi' },
  { name: 'Yellowstone Club', category: 'landmark', searchQuery: 'Yellowstone Club Big Sky Montana', description: 'Private ski/golf club' },
  { name: 'Augusta National', category: 'landmark', searchQuery: 'Augusta National Golf Club Georgia', description: 'The Masters' },
  { name: 'NUAIR BVLOS Corridor', category: 'landmark', geojson: createNUAIRCorridor(), description: '50 mi BVLOS test corridor' },

  // ── Cities ───────────────────────────────────────────────────────
  { name: 'New York City', category: 'city', osmId: 175905, osmType: 'relation', description: '302 sq mi' },
  { name: 'Manhattan', category: 'city', osmId: 8398124, osmType: 'relation', description: '23 sq mi' },
  { name: 'Monaco', category: 'country', osmId: 2220322, osmType: 'relation', description: '0.78 sq mi' },
  { name: 'Vatican City', category: 'country', osmId: 36989, osmType: 'relation', description: '0.17 sq mi' },
  { name: 'San Francisco', category: 'city', osmId: 111968, osmType: 'relation', description: '47 sq mi' },
  { name: 'London', category: 'city', osmId: 65606, osmType: 'relation', description: '607 sq mi' },
  { name: 'Paris', category: 'city', osmId: 71525, osmType: 'relation', description: '41 sq mi' },
  { name: 'Tokyo', category: 'city', osmId: 1543125, osmType: 'relation', description: '845 sq mi' },
  { name: 'Singapore', category: 'country', osmId: 536780, osmType: 'relation', description: '278 sq mi' },
  { name: 'Gainesville', category: 'city', osmId: 118870, osmType: 'relation', description: '63 sq mi' },
  { name: 'Palm Beach', category: 'city', searchQuery: 'Palm Beach Florida town', description: '3.9 sq mi' },

  // ── US States ────────────────────────────────────────────────────
  { name: 'Texas', category: 'state', osmId: 114690, osmType: 'relation', description: '268,596 sq mi' },
  { name: 'Florida', category: 'state', osmId: 162050, osmType: 'relation', description: '65,758 sq mi' },
  { name: 'Alaska', category: 'state', osmId: 1116270, osmType: 'relation', description: '663,300 sq mi' },
  { name: 'New Jersey', category: 'state', osmId: 224951, osmType: 'relation', description: '8,723 sq mi' },
  { name: 'North Dakota', category: 'state', osmId: 161653, osmType: 'relation', description: '70,762 sq mi' },
  { name: 'Rhode Island', category: 'state', osmId: 392915, osmType: 'relation', description: '1,214 sq mi' },

  // ── Countries ────────────────────────────────────────────────────
  { name: 'United States', category: 'country', osmId: 148838, osmType: 'relation', description: '3.8M sq mi' },
  { name: 'Russia', category: 'country', osmId: 60189, osmType: 'relation', description: '6.6M sq mi' },
  { name: 'Australia', category: 'country', osmId: 80500, osmType: 'relation', description: '2.97M sq mi' },
  { name: 'Japan', category: 'country', osmId: 382313, osmType: 'relation', description: '145,937 sq mi' },
  { name: 'United Kingdom', category: 'country', osmId: 62149, osmType: 'relation', description: '93,628 sq mi' },
  { name: 'Switzerland', category: 'country', osmId: 51701, osmType: 'relation', description: '15,940 sq mi' },
  { name: 'Israel', category: 'country', osmId: 1473946, osmType: 'relation', description: '8,550 sq mi' },
];
