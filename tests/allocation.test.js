import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { EXPERIMENT_CONFIG } from '../src/config/experiment';

describe('10-Audio Library & Balanced Stratified Allocation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Audio library contains exactly 10 recordings with balanced categories and genders', () => {
    const library = EXPERIMENT_CONFIG.audioLibrary;
    expect(library).toHaveLength(10);

    const pure = library.filter((a) => a.category === 'pure');
    const codeMixed = library.filter((a) => a.category === 'code_mixed');
    expect(pure).toHaveLength(6);
    expect(codeMixed).toHaveLength(4);

    const males = library.filter((a) => a.speakerGender === 'male');
    const females = library.filter((a) => a.speakerGender === 'female');
    expect(males).toHaveLength(5);
    expect(females).toHaveLength(5);

    // Verify language varieties
    const pureHindi = library.filter((a) => a.languageVariety === 'Pure Hindi');
    const pureEnglish = library.filter((a) => a.languageVariety === 'Pure English');
    const pureBombayHindi = library.filter((a) => a.languageVariety === 'Pure Bombay Hindi');
    const codeMixedHindi = library.filter((a) => a.languageVariety === 'Code-Mixed Hindi');
    const codeMixedBombayEnglish = library.filter((a) => a.languageVariety === 'Code-Mixed Bombay English');

    expect(pureHindi).toHaveLength(2); // 1 M, 1 F
    expect(pureEnglish).toHaveLength(2); // 1 M, 1 F
    expect(pureBombayHindi).toHaveLength(2); // 1 M, 1 F
    expect(codeMixedHindi).toHaveLength(2); // 1 M, 1 F
    expect(codeMixedBombayEnglish).toHaveLength(2); // 1 M, 1 F
  });

  it('2. Every participant session receives exactly one Pure and one Code-Mixed audio', async () => {
    const { data } = await api.initOrResumeSession();
    expect(data.assigned_audio_1).toBeDefined();
    expect(data.assigned_audio_2).toBeDefined();

    const categories = [data.assigned_audio_1.category, data.assigned_audio_2.category];
    expect(categories).toContain('pure');
    expect(categories).toContain('code_mixed');
  });

  it('3. Balanced allocation distributes across all 10 audios over sequential participants', async () => {
    const allocatedCounts = {};
    const genderCounts = { male: 0, female: 0 };
    const numParticipants = 60;

    for (let i = 0; i < numParticipants; i++) {
      // Clear current active session key to simulate a distinct new participant visiting
      localStorage.removeItem('audio_research_session');

      const { data } = await api.initOrResumeSession();
      const a1 = data.assigned_audio_1;
      const a2 = data.assigned_audio_2;

      allocatedCounts[a1.id] = (allocatedCounts[a1.id] || 0) + 1;
      allocatedCounts[a2.id] = (allocatedCounts[a2.id] || 0) + 1;

      genderCounts[a1.speakerGender] = (genderCounts[a1.speakerGender] || 0) + 1;
      genderCounts[a2.speakerGender] = (genderCounts[a2.speakerGender] || 0) + 1;
    }

    // Verify all 10 audio IDs (1 to 10) received allocations
    for (let id = 1; id <= 10; id++) {
      expect(allocatedCounts[id]).toBeGreaterThan(0);
    }

    // Verify Pure audios (ids 1-6) each received approximately 10 allocations (60 / 6 = 10)
    for (let id = 1; id <= 6; id++) {
      expect(allocatedCounts[id]).toBeGreaterThanOrEqual(9);
      expect(allocatedCounts[id]).toBeLessThanOrEqual(11);
    }

    // Verify Code-Mixed audios (ids 7-10) each received approximately 15 allocations (60 / 4 = 15)
    for (let id = 7; id <= 10; id++) {
      expect(allocatedCounts[id]).toBeGreaterThanOrEqual(14);
      expect(allocatedCounts[id]).toBeLessThanOrEqual(16);
    }

    // Verify speaker gender balance across all assignments
    expect(genderCounts.male).toBeGreaterThan(50);
    expect(genderCounts.female).toBeGreaterThan(50);
  });

  it('4. Resuming session preserves the exact assigned audios without re-allocating', async () => {
    const { data: initial } = await api.initOrResumeSession();
    const assignedId1 = initial.assigned_audio_1.id;
    const assignedId2 = initial.assigned_audio_2.id;

    // Simulate page refresh
    const { data: resumed } = await api.initOrResumeSession(initial.session_token);
    expect(resumed.assigned_audio_1.id).toBe(assignedId1);
    expect(resumed.assigned_audio_2.id).toBe(assignedId2);
  });
});
