import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface ModelCheckpointInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
  type: 'pth' | 'onnx' | 'other';
  metadata?: any;
}

export async function GET() {
  try {
    const searchDirs = [
      path.resolve('models'),
      path.resolve('public/models'),
      path.resolve('runs'),
    ];

    const checkpoints: ModelCheckpointInfo[] = [];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const relFile of files) {
        const fullPath = path.join(dir, relFile);
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;

        const ext = path.extname(relFile).toLowerCase();
        if (ext === '.pth' || ext === '.onnx') {
          const stats = fs.statSync(fullPath);
          let metadata: any = null;

          if (ext === '.pth') {
            try {
              // Try reading metadata using python one-liner
              const pyCmd = `python -c "import torch, json, sys; ckpt=torch.load(r'${fullPath}', map_location='cpu', weights_only=False); print(json.dumps({k: (v if not hasattr(v, 'tolist') else v.tolist()) for k,v in ckpt.items() if k != 'state_dict'}))"`;
              const output = execSync(pyCmd, { timeout: 3000, encoding: 'utf-8' }).trim();
              metadata = JSON.parse(output);
            } catch {
              metadata = { note: 'No metadata or python torch unavailable to inspect checkpoint' };
            }
          }

          checkpoints.push({
            filename: path.basename(relFile),
            path: fullPath.replace(/\\/g, '/'),
            sizeBytes: stats.size,
            updatedAt: stats.mtime.toISOString(),
            type: ext === '.pth' ? 'pth' : 'onnx',
            metadata,
          });
        }
      }
    }

    return NextResponse.json({ checkpoints }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list models' }, { status: 500 });
  }
}
