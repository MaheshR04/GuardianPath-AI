class MemoryManager {
  constructor() {
    this.memories = new Map();
  }

  getMemory(userId) {
    if (!this.memories.has(userId)) {
      this.memories.set(userId, {
        userId,
        locationHistory: [],
        battery: { level: null, charging: null },
        activeRoute: null,
        reflections: [],
        movementStatus: 'UNKNOWN',
        stationaryDurationSeconds: 0,
        lastUpdated: new Date(),
      });
    }
    return this.memories.get(userId);
  }


  updateLocation(userId, location) {
    const memory = this.getMemory(userId);
    memory.locationHistory.push({
      ...location,
      timestamp: location.timestamp || new Date().toISOString(),
    });
    
    // Cap memory history size to last 10 updates
    if (memory.locationHistory.length > 10) {
      memory.locationHistory.shift();
    }
    
    memory.lastUpdated = new Date();
  }

  updateBattery(userId, battery) {
    const memory = this.getMemory(userId);
    memory.battery = {
      level: typeof battery?.level === 'number' ? battery.level : null,
      charging: typeof battery?.charging === 'boolean' ? battery.charging : null,
    };
    memory.lastUpdated = new Date();
  }

  updateRoute(userId, route) {
    const memory = this.getMemory(userId);
    memory.activeRoute = route || null;
    memory.lastUpdated = new Date();
  }

  addReflection(userId, reflectionType, details = {}) {
    const memory = this.getMemory(userId);
    memory.reflections.push({
      type: reflectionType,
      timestamp: new Date(),
      details,
    });

    if (memory.reflections.length > 15) {
      memory.reflections.shift();
    }
  }

  getLastReflection(userId, reflectionType) {
    const memory = this.getMemory(userId);
    const filtered = memory.reflections.filter((r) => r.type === reflectionType);
    return filtered[filtered.length - 1] || null;
  }

  clearMemory(userId) {
    this.memories.delete(userId);
  }
}

export const memoryManager = new MemoryManager();
