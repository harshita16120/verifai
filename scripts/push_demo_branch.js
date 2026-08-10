const git = require('isomorphic-git');
const fs = require('fs');
const http = require('isomorphic-git/http/node');
const path = require('path');

const dir = path.resolve('.');
const url = 'https://github.com/harshita16120/verifai.git';
const ref = process.env.GIT_BRANCH || 'main';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    console.log(`🚀 Initializing Git repository with isomorphic-git...`);
    await git.init({ fs, dir });

    console.log('🔗 Setting remote origin URL...');
    await git.addRemote({ fs, dir, remote: 'origin', url, force: true });

    console.log(`🌿 Checking out branch "${ref}"...`);
    await git.checkout({ fs, dir, ref, create: true }).catch(() => {
      return git.checkout({ fs, dir, ref });
    });

    console.log('📂 Staging project files...');
    await git.add({ fs, dir, filepath: 'package.json' });
    await git.add({ fs, dir, filepath: 'next.config.js' });
    await git.add({ fs, dir, filepath: 'tailwind.config.ts' });
    await git.add({ fs, dir, filepath: 'tsconfig.json' });
    await git.add({ fs, dir, filepath: '.gitignore' });
    await git.add({ fs, dir, filepath: 'middleware.ts' }).catch(() => {});
    await git.add({ fs, dir, filepath: 'vercel.json' }).catch(() => {});
    await git.add({ fs, dir, filepath: 'postcss.config.js' }).catch(() => {});
    await git.add({ fs, dir, filepath: 'README.md' }).catch(() => {});

    // Stage directories recursively
    async function stageDir(relPath) {
      if (!fs.existsSync(path.join(dir, relPath))) return;
      const entries = fs.readdirSync(path.join(dir, relPath), { withFileTypes: true });
      for (const entry of entries) {
        const entryRel = path.join(relPath, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
            await stageDir(entryRel);
          }
        } else {
          await git.add({ fs, dir, filepath: entryRel });
        }
      }
    }

    await stageDir('app');
    await stageDir('components');
    await stageDir('lib');
    await stageDir('public');
    await stageDir('scripts');

    console.log('📝 Creating commit...');
    const sha = await git.commit({
      fs,
      dir,
      author: {
        name: 'Harshita',
        email: 'harshita@verifai.open',
      },
      message: 'fix: Add vercel.json framework config for Vercel deployment & routing',
    });
    console.log(`✅ Commit created with SHA: ${sha}`);

    console.log(`📤 Pushing to ${url} (branch: ${ref})...`);
    const pushResult = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref,
      onAuth: () => ({ username: token }),
    });

    console.log(`🎉 Push to ${ref} completed successfully!`, pushResult);
  } catch (err) {
    console.error('⚠️ Git operation report:', err.message);
  }
}

main();

