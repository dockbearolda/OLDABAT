import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', 'Catégorie');
const OUTPUT = resolve(__dirname, '..', 'src', 'data', 'catalog.json');

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

const categories = readdirSync(ROOT).filter(n => isDir(join(ROOT, n))).sort();

const catalog = categories.map(cat => {
  const catPath = join(ROOT, cat);
  const refs = readdirSync(catPath).filter(n => isDir(join(catPath, n))).sort();

  return {
    name: cat,
    references: refs.map(ref => {
      const refPath = join(catPath, ref);
      const entries = readdirSync(refPath);
      const files = entries.filter(f => /\.(png|jpg|jpeg)$/i.test(f));
      const subDirs = entries.filter(n => isDir(join(refPath, n)));

      const basePath = `/catalog/${cat}/${ref}`;

      // Cas sous-dossiers couleur (ex: Lycra - L001 - Aluminum/)
      if (subDirs.length > 0) {
        const colors = subDirs.map(colorDir => {
          const colorPath = join(refPath, colorDir);
          const colorFiles = readdirSync(colorPath).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
          // Extraire le nom de couleur depuis le dossier (après le dernier " - ")
          const colorName = colorDir.split(/\s*[-–]\s*/).pop().trim();
          const front = colorFiles.find(f => /_av\.(jpg|jpeg|png)$/i.test(f));
          const back = colorFiles.find(f => /_arriere\.(jpg|jpeg|png)$/i.test(f));
          return {
            name: colorName,
            front: front ? `${basePath}/${colorDir}/${front}` : null,
            back: back ? `${basePath}/${colorDir}/${back}` : null,
            side: null,
          };
        }).filter(c => c.front).sort((a, b) => a.name.localeCompare(b.name));

        return { name: ref, colors };
      }

      // Cas {ColorName}_front.ext / {ColorName}_back.ext (ex: Paragon)
      const frontFiles2 = files.filter(f => /_front\.(png|jpg|jpeg)$/i.test(f));
      if (frontFiles2.length > 0) {
        const colors = frontFiles2.map(f => {
          const colorName = f.replace(/_front\.(png|jpg|jpeg)$/i, '').replace(/_/g, ' ');
          const ext = f.match(/\.(\w+)$/)?.[1] || 'jpg';
          const backFile = f.replace(/_front\./, '_back.');
          const back = files.find(bf => bf === backFile);
          return {
            name: colorName,
            front: `${basePath}/${f}`,
            back: back ? `${basePath}/${back}` : null,
            side: null,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        return { name: ref, colors };
      }

      // Cas standard: PS_{refCode}_{COLOR}.ext
      const refCode = ref.split(/\s*[-–]\s*/)[0].trim();
      const frontFiles = files.filter(f => {
        const m = f.match(/^PS_([^_]+)_(.+)\.(png|jpg|jpeg)$/i);
        return m && m[1] === refCode;
      });

      const colors = frontFiles.map(f => {
        const color = f.match(/_([^_]+)\.\w+$/)?.[1] || '';
        const ext = f.match(/\.(\w+)$/)?.[1] || 'png';
        const back = files.find(bf => bf === `PS_${refCode}-B_${color}.${ext}`);
        const side = files.find(sf => sf === `PS_${refCode}-S_${color}.${ext}`);
        return {
          name: color,
          front: `${basePath}/${f}`,
          back: back ? `${basePath}/${back}` : null,
          side: side ? `${basePath}/${side}` : null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      return { name: ref, colors };
    })
  };
});

writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2));

const totalRefs = catalog.reduce((a, c) => a + c.references.length, 0);
const totalColors = catalog.reduce((a, c) => a + c.references.reduce((b, r) => b + r.colors.length, 0), 0);
console.log(`Done: ${catalog.length} catégories, ${totalRefs} références, ${totalColors} couleurs`);
