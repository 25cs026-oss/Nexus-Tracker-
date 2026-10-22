import { DeviceMember, GridCircle, SafeZone, CheckInPing, HistoryPoint } from '../types';

export const DEMO_PIN = 'FAMILY';

export const DEMO_CIRCLE: GridCircle = {
  id: DEMO_PIN,
  name: 'The Anderson Family',
  createdAt: new Date().toISOString(),
  safeZones: [
    { id: 'zone-1', name: 'Home', icon: '🏠', lat: 37.7749, lng: -122.4194, radius: 200 },
    { id: 'zone-2', name: 'Lincoln High School', icon: '🏫', lat: 37.7833, lng: -122.4167, radius: 250 },
    { id: 'zone-3', name: 'City Park', icon: '🌳', lat: 37.7690, lng: -122.4467, radius: 500 }
  ]
};

export const DEMO_MEMBERS: DeviceMember[] = [
  {
    id: 'demo-mom',
    name: 'Sarah (Mom)',
    role: 'Mom',
    avatar: '👩',
    lastLat: 37.7833,
    lastLng: -122.4167,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 2), // 2 mins ago
    gridId: DEMO_PIN,
    battery: 88,
    isCharging: false,
    speed: 0,
    currentPlace: 'Lincoln High School',
    statusMessage: 'Waiting for pickup at main gate 🏫'
  },
  {
    id: 'demo-dad',
    name: 'David (Dad)',
    role: 'Dad',
    avatar: '👨',
    lastLat: 37.7650,
    lastLng: -122.4250,
    lastUpdated: new Date(Date.now() - 1000 * 30), // 30s ago
    gridId: DEMO_PIN,
    battery: 64,
    isCharging: true,
    speed: 8.5, // ~30 km/h driving
    currentPlace: undefined,
    statusMessage: 'Driving back from office 🚗'
  },
  {
    id: 'demo-emma',
    name: 'Emma (Kid)',
    role: 'Daughter',
    avatar: '👧',
    lastLat: 37.7749,
    lastLng: -122.4194,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 5),
    gridId: DEMO_PIN,
    battery: 95,
    isCharging: true,
    speed: 0,
    currentPlace: 'Home',
    statusMessage: 'Doing homework at home 📚'
  }
];

export const DEMO_CHECKINS: CheckInPing[] = [
  {
    id: 'c1',
    deviceId: 'demo-emma',
    memberName: 'Emma (Kid)',
    avatar: '👧',
    message: '🏡 Arrived safely at Home!',
    timestamp: new Date(Date.now() - 1000 * 60 * 25)
  },
  {
    id: 'c2',
    deviceId: 'demo-dad',
    memberName: 'David (Dad)',
    avatar: '👨',
    message: '🚗 Heading home now, see you in 20 mins!',
    timestamp: new Date(Date.now() - 1000 * 60 * 10)
  }
];

export const DEMO_HISTORY: HistoryPoint[] = [
  { lat: 37.7650, lng: -122.4250, timestamp: new Date(Date.now() - 1000 * 30), speed: 8.5, placeName: 'Market & 16th St' },
  { lat: 37.7620, lng: -122.4280, timestamp: new Date(Date.now() - 1000 * 60 * 3), speed: 9.2, placeName: 'Mission District' },
  { lat: 37.7590, lng: -122.4310, timestamp: new Date(Date.now() - 1000 * 60 * 8), speed: 7.1, placeName: 'Valencia Corridor' },
  { lat: 37.7540, lng: -122.4150, timestamp: new Date(Date.now() - 1000 * 60 * 15), speed: 0, placeName: 'Tech Campus' }
];
