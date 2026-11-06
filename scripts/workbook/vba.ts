/**
 * Read and rewrite the VBA module source inside a vbaProject.bin (MS-CFB +
 * MS-OVBA) without Excel. A rewritten module stream holds only its compressed
 * source (offset 0); the compiled-code caches (`_VBA_PROJECT` performance
 * cache, `__SRP_*` streams) are reset, so Excel recompiles from the source
 * when the workbook is opened.
 */
import CFB from "cfb";
import { compress, decompress } from "./ovba";

type Module = { name: string; stream: string; offset: number; offsetPos: number };

function parseDir(dir: Buffer): { modules: Module[]; codePage: number } {
  const modules: Module[] = [];
  let codePage = 1252;
  let pos = 0;
  let current: Partial<Module> | null = null;
  while (pos + 6 <= dir.length) {
    const id = dir.readUInt16LE(pos);
    let size = dir.readUInt32LE(pos + 2);
    const dataPos = pos + 6;
    if (id === 0x0009) size = 6; // PROJECTVERSION: Reserved=4, then 6 bytes of version
    if (id === 0x0003) codePage = dir.readUInt16LE(dataPos);
    if (id === 0x0019) current = { name: dir.subarray(dataPos, dataPos + size).toString("latin1") };
    if (id === 0x001a && current) current.stream = dir.subarray(dataPos, dataPos + size).toString("latin1");
    if (id === 0x0031 && current) {
      current.offset = dir.readUInt32LE(dataPos);
      current.offsetPos = dataPos;
    }
    if (id === 0x002b && current) {
      modules.push(current as Module);
      current = null;
    }
    pos = dataPos + size;
  }
  return { modules, codePage };
}

const decoder = (codePage: number) => (codePage === 65001 ? "utf8" : "latin1");

export class VbaProject {
  private cfb: CFB.CFB$Container;
  private dir: Buffer;
  private modules: Module[];
  private enc: "utf8" | "latin1";
  private changed = new Set<string>();

  constructor(bin: Uint8Array) {
    this.cfb = CFB.read(Buffer.from(bin), { type: "buffer" });
    const dirEntry = CFB.find(this.cfb, "Root Entry/VBA/dir");
    if (!dirEntry?.content) throw new Error("vbaProject.bin has no VBA/dir stream");
    this.dir = decompress(dirEntry.content as Uint8Array);
    const parsed = parseDir(this.dir);
    this.modules = parsed.modules;
    this.enc = decoder(parsed.codePage);
  }

  moduleNames(): string[] {
    return this.modules.map((m) => m.name);
  }

  private module(name: string): Module {
    const m = this.modules.find((x) => x.name === name);
    if (!m) throw new Error(`No VBA module ${name}`);
    return m;
  }

  source(name: string): string {
    const m = this.module(name);
    const entry = CFB.find(this.cfb, `Root Entry/VBA/${m.stream}`);
    if (!entry?.content) throw new Error(`No stream for module ${name}`);
    return decompress(entry.content as Uint8Array, m.offset).toString(this.enc);
  }

  setSource(name: string, text: string): void {
    const m = this.module(name);
    const entry = CFB.find(this.cfb, `Root Entry/VBA/${m.stream}`);
    if (!entry) throw new Error(`No stream for module ${name}`);
    entry.content = compress(Buffer.from(text, this.enc));
    entry.size = (entry.content as Buffer).length;
    this.dir.writeUInt32LE(0, m.offsetPos);
    m.offset = 0;
    this.changed.add(name);
  }

  /** Every module's source, for checks. */
  allSources(): Record<string, string> {
    return Object.fromEntries(this.modules.map((m) => [m.name, this.source(m.name)]));
  }

  write(): Buffer {
    if (this.changed.size) {
      // Source-only modules need every module's compiled cache dropped, not just the changed ones.
      for (const m of this.modules) {
        if (m.offset !== 0) this.setSource(m.name, this.source(m.name));
      }
      const dirEntry = CFB.find(this.cfb, "Root Entry/VBA/dir")!;
      dirEntry.content = compress(this.dir);
      dirEntry.size = (dirEntry.content as Buffer).length;
      const vbaProject = CFB.find(this.cfb, "Root Entry/VBA/_VBA_PROJECT")!;
      vbaProject.content = Buffer.from([0xcc, 0x61, 0xff, 0xff, 0x00, 0x00, 0x00]);
      vbaProject.size = 7;
      for (const e of [...this.cfb.FullPaths]) {
        if (/\/VBA\/__SRP_\d+$/i.test(e)) CFB.utils.cfb_del(this.cfb, e);
      }
    }
    return Buffer.from(CFB.write(this.cfb, { type: "buffer", fileType: "cfb" }) as Uint8Array);
  }
}
