import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
}));
vi.mock('../database', () => ({
  getRecordingsPath: () => '/tmp',
  getThumbnailsPath: () => '/tmp',
}));

import { generateFFmpegFilters, type RedactionMask } from './index';

function mask(style: string, extra: Partial<RedactionMask> = {}): RedactionMask {
  return {
    id: 'm',
    recordingId: 'r',
    startTime: 1000,
    endTime: 2500,
    createdAt: 0,
    regions: [{ bounds: { x: 10, y: 20, width: 100, height: 40 }, style, confidence: 1 } as any],
    ...extra,
  };
}

/** Run the filtergraph over a synthetic clip; throws if ffmpeg rejects it. */
function runFilter(filter: string): void {
  execFileSync(ffmpegInstaller.path, [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=1',
    '-vf', filter, '-f', 'null', '-',
  ]);
}

describe('generateFFmpegFilters', () => {
  it('returns an empty string when there is nothing to redact', () => {
    expect(generateFFmpegFilters([])).toBe('');
  });

  it('uses an opaque filled box for solid regions, limited to the mask time range', () => {
    const f = generateFFmpegFilters([mask('solid')]);
    expect(f).toContain('drawbox=x=10:y=20:w=100:h=40:color=black:t=fill');
    expect(f).toContain("enable='between(t,1.000,2.500)'");
  });

  it('never draws semi-transparent boxes that let content bleed through', () => {
    const f = generateFFmpegFilters([mask('solid'), mask('blur'), mask('pixelate'), mask('pattern')]);
    expect(f).not.toMatch(/color=[^:]*@/);
  });

  it('really blurs blur regions and pixelates pixelate regions', () => {
    expect(generateFFmpegFilters([mask('blur')])).toMatch(/crop=.*boxblur=.*overlay=10:20/);
    expect(generateFFmpegFilters([mask('pixelate')])).toMatch(/crop=.*flags=neighbor.*overlay=10:20/);
  });

  it('leaves the final output unlabeled so it feeds the encoder', () => {
    const f = generateFFmpegFilters([mask('blur'), mask('solid')]);
    expect(f.endsWith(']')).toBe(false);
  });

  it('produces graphs ffmpeg accepts, including regions past the frame edge', () => {
    const offEdge: RedactionMask = {
      ...mask('blur'),
      regions: [{ bounds: { x: 300, y: 200, width: 100, height: 100 }, style: 'blur', confidence: 1 } as any],
    };
    for (const masks of [[mask('solid')], [mask('blur')], [mask('pixelate')], [mask('blur'), mask('pixelate'), mask('solid')], [offEdge]]) {
      expect(() => runFilter(generateFFmpegFilters(masks))).not.toThrow();
    }
  });
});
