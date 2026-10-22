import { DeviceMember, GridCircle, SafeZone, CheckInPing, HistoryPoint } from '../types';

export const DEMO_PIN = 'FAMILY';

export function createDemoDataForLocation(baseLat: number, baseLng: number) {
  const safeZones: SafeZone[] = [
    { id: 'zone-1', name: 'Home', icon: '🏠', lat: baseLat, lng: baseLng, radius: 250 },
    { id: 'zone-2', name: 'Neighborhood School', icon: '🏫', lat: baseLat + 0.006, lng: baseLng + 0.005, radius: 300 },
    { id: 'zone-3', name: 'Central Park', icon: '🌳', lat: baseLat - 0.008, lng: baseLng - 0.006, radius: 450 }
  ];

  const circle: GridCircle = {
    id: DEMO_PIN,
    name: 'The Anderson Family',
    createdAt: new Date().toISOString(),
    safeZones
  };

  const members: DeviceMember[] = [
    {
      id: 'demo-you',
      name: 'You (Me)',
      role: 'Son',
      avatar: '🧑',
      lastLat: baseLat,
      lastLng: baseLng,
      lastUpdated: new Date(),
      gridId: DEMO_PIN,
      battery: 88,
      isCharging: false,
      speed: 0,
      currentPlace: 'Home',
      statusMessage: 'At home with family 🏡'
    },
    {
      id: 'demo-mom',
      name: 'Sarah (Mom)',
      role: 'Mom',
      avatar: '👩',
      lastLat: baseLat + 0.006,
      lastLng: baseLng + 0.005,
      lastUpdated: new Date(Date.now() - 1000 * 60 * 2),
      gridId: DEMO_PIN,
      battery: 92,
      isCharging: false,
      speed: 0,
      currentPlace: 'Neighborhood School',
      statusMessage: 'At school picking up supplies 🏫'
    },
    {
      id: 'demo-dad',
      name: 'David (Dad)',
      role: 'Dad',
      avatar: '👨',
      lastLat: baseLat - 0.009,
      lastLng: baseLng - 0.007,
      lastUpdated: new Date(Date.now() - 1000 * 25),
      gridId: DEMO_PIN,
      battery: 68,
      isCharging: true,
      speed: 7.2, // ~26 km/h driving
      currentPlace: undefined,
      statusMessage: 'Driving back home 🚗'
    }
  ];

  const checkIns: CheckInPing[] = [
    {
      id: 'c1',
      deviceId: 'demo-you',
      memberName: 'You (Me)',
      avatar: '🧑',
      message: '🏡 Arrived safely at Home!',
      timestamp: new Date(Date.now() - 1000 * 60 * 15)
    },
    {
      id: 'c2',
      deviceId: 'demo-dad',
      memberName: 'David (Dad)',
      avatar: '👨',
      message: '🚗 On my way back, see you soon!',
      timestamp: new Date(Date.now() - 1000 * 60 * 5)
    }
  ];

  const history: HistoryPoint[] = [
    { lat: baseLat - 0.009, lng: baseLng - 0.007, timestamp: new Date(Date.now() - 1000 * 25), speed: 7.2, placeName: 'City Avenue' },
    { lat: baseLat - 0.015, lng: baseLng - 0.011, timestamp: new Date(Date.now() - 1000 * 60 * 4), speed: 8.5, placeName: 'Main Boulevard' },
    { lat: baseLat - 0.022, lng: baseLng - 0.015, timestamp: new Date(Date.now() - 1000 * 60 * 12), speed: 6.8, placeName: 'Business District' }
  ];

  return { circle, members, checkIns, history, safeZones };
}

// Default fallback
const defaultData = createDemoDataForLocation(19.0760, 72.8777);
export const DEMO_CIRCLE = defaultData.circle;
export const DEMO_MEMBERS = defaultData.members;
export const DEMO_CHECKINS = defaultData.checkIns;
export const DEMO_HISTORY = defaultData.history;
