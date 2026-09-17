import type { PreferencesRepository } from '@/repositories/preferences.repository';

export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}
  get() { return this.repository.get(); }
  async setAutoplay(autoplay: boolean) { const current = await this.repository.get(); await this.repository.set({ ...current, autoplay }); }
  subscribe(listener: () => void) { return this.repository.subscribe(listener); }
}
