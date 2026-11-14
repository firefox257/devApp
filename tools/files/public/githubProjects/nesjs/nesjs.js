/* ============================================================================
* NESJS 🕹️ Pure JavaScript NES/Famicom core (Phase 2 - Enhanced Debug Build)
* ----------------------------------------------------------------------------
* DEBUG MODE: Set nes.debug = true to enable verbose console logging.
* HOOKS (Phase 3 integration points) are marked with "HOOK:" below.
* ==========================================================================*/
export const CPU_FREQ = 1789773;
export const PPU_FREQ = CPU_FREQ * 3;
export const FRAME_CYCLES = 29781;

/* Standard 64-entry NES palette -> packed 0xAABBGGRR for Little-Endian RGBA */
const PALETTE = [
0x7C7C7C,0x0000FC,0x0000BC,0x4428BC,0x940084,0xA80010,0xA81000,0x881400,
0x503000,0x007800,0x006800,0x005800,0x004058,0x000000,0x000000,0x000000,
0xBCBCBC,0x0078F8,0x0058F8,0x6844F8,0xD800CC,0xE40058,0xF83800,0xE45C10,
0xAC7C00,0x00B800,0x00A800,0x00A844,0x008888,0x000000,0x000000,0x000000,
0xF8F8F8,0x3CBCFC,0x6888FC,0x9878FC,0xF878F8,0xF85898,0xF87858,0xFCA044,
0xF8B800,0xB8F818,0x58D858,0x58F858,0x58F898,0x58C8C8,0x000000,0x000000,
0xF8F8F8,0xA4E4FC,0xB8B8F8,0xD8B8F8,0xF8B8F8,0xF8A4C0,0xF0D0B0,0xFCE0A8,
0xF8D878,0xD8F878,0xB8F8B8,0xB8F8D8,0x00FCFC,0x000000,0x000000,0x000000
].map(c => {
  const r = (c >> 16) & 0xFF;
  const g = (c >> 8) & 0xFF;
  const b = c & 0xFF;
  return (255 << 24) | (b << 16) | (g << 8) | r;
});

/* ==========================================================================
* CARTRIDGE MAPPERS
* ========================================================================*/
class Mapper {
  constructor(nes, rom, chr) {
    this.nes = nes; this.rom = rom; this.chr = chr;
    this.prgBanks = Math.max(1, rom.length / 16384) | 0;
    this.chrBanks = Math.max(1, chr.length / 8192) | 0;
    this.mirror = 0;
  }
  prgRead(a) { return this.rom[a - 0x8000] || 0; }
  prgWrite(a, v) {}
  chrRead(a) { return this.chr.length ? this.chr[a & (this.chr.length-1)] : 0; }
  chrWrite(a, v) {
    if (this.nes.hasChrRam) this.chr[a & 0x1fff] = v;
  }
  clock(c) {}
}

class NROM extends Mapper {
  prgRead(a) {
    const off = this.rom.length === 16384 ? (a - 0x8000) & 0x3FFF : a - 0x8000;
    return this.rom[off] || 0;
  }
}

class MMC1 extends Mapper {
  constructor(n,r,c){
    super(n,r,c);
    this.shift=0; this.count=0;
    this.regs=[0x0c,0,0,0];
    this.reset();
  }
  reset(){
    this.shift=0; this.count=0;
    let m = 0;
    if(this.nes.mapper.mirror === 2) m = 2;
    else if(this.nes.mapper.mirror === 3) m = 3;
    this.regs[0] = 0x0c | m;
    this.regs[1]=0; this.regs[2]=0; this.regs[3]=0;
  }
  prgRead(a){
    const bank = this.regs[3] & (this.prgBanks-1);
    const mode = (this.regs[0]>>2)&3;
    let off;
    if(this.prgBanks===1) off=(a-0x8000)&0x3fff;
    else if(mode===0){ off=((bank&~1)&(this.prgBanks-1))*16384+((a-0x8000)&0x3fff); }
    else if(mode===1){ const b=(bank&~1)+(a>=0xC000?1:0); off=(b&(this.prgBanks-1))*16384+((a-0x8000)&0x3fff); }
    else if(mode===2){ off=(a<0xC000?0:(bank&(this.prgBanks-1)))*16384+((a-0x8000)&0x3fff); }
    else { off=(a<0xC000?(bank&(this.prgBanks-1)):(this.prgBanks-1))*16384+((a-0x8000)&0x3fff); }
    return this.rom[off % this.rom.length] || 0;
  }
  chrRead(a){
    if(!this.chr.length) return 0;
    if(this.chrBanks===1) return this.chr[a & 0x1fff];
    let bank;
    if(this.regs[0]&0x10) bank=((a>>12)&1) ? this.regs[2] : this.regs[1];
    else bank=this.regs[1]>>1;
    bank &= (this.chrBanks - 1);
    return this.chr[(bank*4096 + (a&0xfff)) % this.chr.length] || 0;
  }
  chrWrite(a, v) {
    if(!this.chr.length || !this.nes.hasChrRam) return;
    if(this.chrBanks===1) {
      this.chr[a & 0x1fff] = v;
      return;
    }
    let bank;
    if(this.regs[0]&0x10) bank=((a>>12)&1) ? this.regs[2] : this.regs[1];
    else bank=this.regs[1]>>1;
    bank &= (this.chrBanks - 1);
    this.chr[(bank*4096 + (a&0xfff)) % this.chr.length] = v;
  }
  prgWrite(a,v){
    if(v&0x80){
      this.count=0;
      let m = 0;
      if(this.nes.mapper.mirror === 2) m = 2;
      else if(this.nes.mapper.mirror === 3) m = 3;
      this.regs[0] = 0x0c | m;
      this.shift=0;
      return;
    }
    this.shift |= (v&1)<<this.count++;
    if(this.count<5) return;
    const reg=(a>>13)&3, val=this.shift;
    this.shift=0; this.count=0;
    this.regs[reg]=val;
    this.mirror = (val & 3) === 2 ? 2 : (val & 3) === 3 ? 3 : (val & 1);
  }
}

class UxROM extends Mapper {
  constructor(n,r,c){ super(n,r,c); this.bank=0; }
  prgRead(a){
    const bank = a<0xC000 ? this.bank%this.prgBanks : this.prgBanks-1;
    return this.rom[bank*16384 + ((a-0x8000)&0x3fff)]||0;
  }
  prgWrite(a,v){ if(a>=0x8000) this.bank=v; }
}

class CNROM extends Mapper {
  constructor(n,r,c){ super(n,r,c); this.bank=0; }
  chrRead(a){ return this.chr.length ? this.chr[(this.bank*8192+a)%this.chr.length]||0 : 0; }
  prgWrite(a,v){ if(a>=0x8000) this.bank=v; }
}

class MMC3 extends Mapper {
  constructor(n,r,c){
    super(n,r,c); this.regs=new Array(8).fill(0); this.sel=0; this.prgMode=0; this.chrMode=0;
    this.irqLatch=0; this.irqReload=false; this.irqEnable=false; this.irqCounter=0;
    this.lastBank=this.prgBanks-1;
  }
  prgRead(a){
    const i=(a-0x8000)>>13;
    let bank=this.regs[6+i];
    if((i===0&&this.prgMode)||(i===2&&!this.prgMode)) bank=this.lastBank-1;
    if(i===3) bank=this.lastBank;
    return this.rom[(bank%this.prgBanks)*8192 + (a&0x1fff)]||0;
  }
  chrRead(a){
    if(!this.chr.length) return 0;
    const bank = ((a >> 10) ^ (this.chrMode ? 4 : 0)) & 7;
    let real;
    if (this.chrMode === 0) {
      if (bank < 2) real = this.regs[0] + (bank & 1);
      else if (bank < 4) real = this.regs[1] + (bank & 1);
      else real = this.regs[bank];
    } else {
      if (bank < 4) real = this.regs[bank + 4];
      else real = this.regs[bank - 4] + (bank & 1);
    }
    return this.chr[(real * 1024 + (a & 0x3ff)) % this.chr.length] || 0;
  }
  chrWrite(a, v) {
    if (!this.chr.length || !this.nes.hasChrRam) return;
    const bank = ((a >> 10) ^ (this.chrMode ? 4 : 0)) & 7;
    let real;
    if (this.chrMode === 0) {
      if (bank < 2) real = this.regs[0] + (bank & 1);
      else if (bank < 4) real = this.regs[1] + (bank & 1);
      else real = this.regs[bank];
    } else {
      if (bank < 4) real = this.regs[bank + 4];
      else real = this.regs[bank - 4] + (bank & 1);
    }
    this.chr[(real * 1024 + (a & 0x3ff)) % this.chr.length] = v;
  }
  prgWrite(a,v){
    if(a>=0xA000&&a<=0xAFFF){
      if(a<0xA004) this.mirror = (v & 1) ? 3 : 2;
      return;
    }
    if(a>=0xC000&&a<=0xCFFF){ this.irqLatch=v; return; }
    if(a>=0xE000&&a<=0xEFFF){ this.irqReload=true; return; }
    switch(a&0xE000){
      case 0x8000: this.sel=v&7; this.prgMode=(v>>6)&1; this.chrMode=(v>>7)&1; break;
      case 0xA000: break;
      case 0xC000: break;
      case 0xE000: this.irqEnable=(a&2)!==0; this.irqCounter=0; break;
    }
    if((a&0xE000)===0x8000) this.regs[this.sel]=v;
  }
  clock(c){
    this._c=(this._c||0)+c;
    if(this._c>=114){ this._c=0;
      if(this.irqReload) this.irqCounter=this.irqLatch;
      else if(this.irqCounter===0) this.irqCounter=this.irqLatch;
      else this.irqCounter--;
      if(this.irqCounter===0&&this.irqEnable) this.nes.cpu.irq();
    }
  }
}

/* ==========================================================================
* CPU 🕹️ MOS 6502
* ========================================================================*/
class CPU6502 {
  constructor(nes){
    this.nes=nes; this.a=0; this.x=0; this.y=0; this.sp=0xFD; this.pc=0; this.p=0x24;
    this.irqPending=false; this.nmiPending=false; this.cycles=0;
    this.ops=new Array(256);
    this._buildTable();
  }
  read(a){ return this.nes.cpuRead(a&0xffff); }
  write(a,v){ this.nes.cpuWrite(a&0xffff,v&0xff); }
  rd16(a){ return this.read(a)|(this.read((a+1)&0xffff)<<8); }
  push(v){ this.write(0x100|this.sp--,v); }
  pull(){ return this.read(0x100|((++this.sp)&0xff)); }
  flag(b){ return (this.p&b)!==0; }
  setf(b,on){ if(on) this.p|=b; else this.p&=~b; }
  zn(v){ this.setf(0x80,(v&0x80)!==0); this.setf(0x02,(v&0xff)===0); }
  nmi(){ this.nmiPending=true; }
  irq(){ this.irqPending=true; }
  ea(mode){
    let a,v,cross=false;
    switch(mode){
      case 'imm': a=this.pc; this.pc=(this.pc+1)&0xffff; return {addr:a,val:this.read(a),cross:false};
      case 'zp':  a=this.read(this.pc); this.pc=(this.pc+1)&0xffff; break;
      case 'zpx': a=(this.read(this.pc)+this.x)&0xff; this.pc=(this.pc+1)&0xffff; break;
      case 'zpy': a=(this.read(this.pc)+this.y)&0xff; this.pc=(this.pc+1)&0xffff; break;
      case 'abs': a=this.rd16(this.pc); this.pc=(this.pc+2)&0xffff; break;
      case 'abx': case 'aby': {
        const r=mode==='abx'?this.x:this.y; const base=this.rd16(this.pc); this.pc=(this.pc+2)&0xffff;
        a=(base+r)&0xffff; cross=((base&0xff)+r)>0xff; break;
      }
      case 'indx': {
        const z=(this.read(this.pc)+this.x)&0xff; this.pc=(this.pc+1)&0xffff;
        a=(this.read(z)|(this.read((z+1)&0xff)<<8)); break;
      }
      case 'indy': {
        const z=this.read(this.pc); this.pc=(this.pc+1)&0xffff;
        const base=this.read(z)|(this.read((z+1)&0xff)<<8);
        a=(base+this.y)&0xffff; cross=((base&0xff)+this.y)>0xff; break;
      }
      case 'ind': {
        const p=this.rd16(this.pc); this.pc=(this.pc+2)&0xffff;
        a=this.read(p)|(this.read((p&0xff00)|((p+1)&0xff))<<8); break;
      }
      case 'rel': {
        v=this.read(this.pc); this.pc=(this.pc+1)&0xffff;
        const off=v<128?v:v-256; a=(this.pc+off)&0xffff;
        cross=(this.pc&0xff00)!==(a&0xff00); return {addr:a,val:v,cross};
      }
      default: a=0;
    }
    return {addr:a,val:this.read(a),cross};
  }
  _buildTable(){
    const map=("IMP,IND,IMP,IND,IMP,ZP,IMP,ZP,IMP,IMM,ACC,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "JSR,ABS,IMP,ABS,IMP,ZP,IMP,ZP,IMP,IMM,ACC,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "RTI,IMM,IMP,IMM,IMP,ZP,IMP,ZP,IMP,IMM,ACC,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "RTS,IMM,IMP,IMM,IMP,ZP,IMP,ZP,IMP,IMM,ACC,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "IMP,INDX,IMP,INDX,IMP,ZP,IMP,ZP,IMP,IMM,IMP,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "IMP,IMM,IMP,IMM,IMP,ZP,IMP,ZP,IMP,IMM,IMP,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "IMP,INDX,IMP,INDX,IMP,ZP,IMP,ZP,IMP,IMM,IMP,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS,"+
    "IMP,INDX,IMP,INDX,IMP,ZP,IMP,ZP,IMP,IMM,IMP,IMM,IMP,ABS,IMP,ABS,"+
    "REL,INDY,IMP,INDY,IMP,ZPX,IMP,ZPX,IMP,ABY,IMP,ABY,IMP,ABS,IMP,ABS").split(',');
    const cyc={IMP:2,ACC:2,IMM:2,ZP:3,ZPX:4,ZPY:4,ABS:4,ABX:4,ABY:4,IND:6,INDX:6,INDY:5,REL:2,JSR:6};
    for(let i=0;i<256;i++) this.ops[i]={mode:map[i],cycles:cyc[map[i]]||2,page:false,fn:()=>0};
    const def=(codes,mode,cycles,fn,page=false)=>{
      for(const c of codes) this.ops[c]={mode,cycles,page,fn};
    };
    const C=this;
    const load=(reg,codes,modes)=>{
      for(const [mode,cycles,page] of modes) def(codes,mode,cycles,(cpu,e)=>{
        cpu[reg]=e.val; cpu.zn(cpu[reg]);
      },page);
    };
    load('a',[0xA9,0xA5,0xB5,0xAD,0xBD,0xB9,0xA1,0xB1],[
      ['imm',2,false],['zp',3,false],['zpx',4,false],['abs',4,false],['abx',4,true],['aby',4,true],['indx',6,false],['indy',5,true]]);
    load('x',[0xA2,0xA6,0xB6,0xAE,0xBE],[
      ['imm',2,false],['zp',3,false],['zpy',4,false],['abs',4,false],['aby',4,true]]);
    load('y',[0xA0,0xA4,0xB4,0xAC,0xBC],[
      ['imm',2,false],['zp',3,false],['zpx',4,false],['abs',4,false],['abx',4,true]]);
    const store=(reg,codes,modes)=>{
      for(const [mode,cycles,page] of modes) def(codes,mode,cycles,(cpu,e)=>{
        cpu.write(e.addr,cpu[reg]);
      },page);
    };
    store('a',[0x85,0x95,0x8D,0x9D,0x99,0x81,0x91],[
      ['zp',3,false],['zpx',4,false],['abs',4,false],['abx',5,false],['aby',5,false],['indx',6,false],['indy',6,false]]);
    store('x',[0x86,0x96,0x8E],[['zp',3,false],['zpy',4,false],['abs',4,false]]);
    store('y',[0x84,0x94,0x8C],[['zp',3,false],['zpx',4,false],['abs',4,false]]);
    const alu=(codes,fn)=>{
      for(const [mode,cycles,page] of [
        ['imm',2,false],['zp',3,false],['zpx',4,false],['abs',4,false],['abx',4,true],['aby',4,true],['indx',6,false],['indy',5,true]])
        def(codes,mode,cycles,(cpu,e)=>{ fn(cpu,e.val); },page);
    };
    alu([0x69,0x65,0x75,0x6D,0x7D,0x79,0x61,0x71],(cpu,v)=>{
      const s=cpu.a+v+(cpu.flag(1)?1:0);
      cpu.setf(0x40,((~(cpu.a^v)&(cpu.a^s)&0x80))!==0);
      cpu.a=s&0xff; cpu.setf(1,s>0xff); cpu.zn(cpu.a);
    });
    alu([0xE9,0xE5,0xF5,0xED,0xFD,0xF9,0xE1,0xF1],(cpu,v)=>{
      const s=cpu.a+(v^0xff)+(cpu.flag(1)?1:0);
      cpu.setf(0x40,(((cpu.a^v)&(cpu.a^s)&0x80))!==0);
      cpu.a=s&0xff; cpu.setf(1,s>0xff); cpu.zn(cpu.a);
    });
    alu([0x09,0x05,0x15,0x0D,0x1D,0x19,0x01,0x11],(cpu,v)=>{cpu.a|=v;cpu.zn(cpu.a);});
    alu([0x29,0x25,0x35,0x2D,0x3D,0x39,0x21,0x31],(cpu,v)=>{cpu.a&=v;cpu.zn(cpu.a);});
    alu([0x49,0x45,0x55,0x4D,0x5D,0x59,0x41,0x51],(cpu,v)=>{cpu.a^=v;cpu.zn(cpu.a);});
    def([0x18],'IMP',1,(c)=>c.setf(1,false));
    def([0x38],'IMP',1,(c)=>c.setf(1,true));
    def([0x58],'IMP',1,(c)=>c.setf(0x04,false));
    def([0x78],'IMP',1,(c)=>c.setf(0x04,true));
    def([0xB8],'IMP',1,(c)=>c.setf(0x40,false));
    def([0xD8],'IMP',1,(c)=>c.setf(0x08,true));
    def([0xF8],'IMP',1,(c)=>c.setf(0x08,false));
    const cmp=(reg,codes,modes)=>{ for(const [m,cy,pg] of modes) def(codes,m,cy,(cpu,e)=>{
      const v=cpu[reg]-e.val; cpu.setf(1,v>=0); cpu.zn(v&0xff);
    },pg); };
    cmp('a',[0xC9,0xC5,0xD5,0xCD,0xDD,0xD9,0xC1,0xD1],[
      ['imm',2,false],['zp',3,false],['zpx',4,false],['abs',4,false],['abx',4,true],['aby',4,true],['indx',6,false],['indy',5,true]]);
    cmp('x',[0xE0,0xE4,0xEC],[['imm',2,false],['zp',3,false],['abs',4,false]]);
    cmp('y',[0xC0,0xC4,0xCC],[['imm',2,false],['zp',3,false],['abs',4,false]]);
    def([0x24],'ZP',3,(c,e)=>{const v=c.a&e.val;c.setf(0x02,(v&0xff)===0);c.setf(0x80,(v&0x80)!==0);c.setf(0x40,(e.val&0x40)!==0);});
    def([0x2C],'ABS',4,(c,e)=>{const v=c.a&e.val;c.setf(0x02,(v&0xff)===0);c.setf(0x80,(v&0x80)!==0);c.setf(0x40,(e.val&0x40)!==0);});
    const rmw=(codes,fn,modes)=>{ for(const [m,cy] of modes) def(codes,m,cy,(c,e)=>{
      const v=fn(c.read(e.addr)); c.write(e.addr,v); c.zn(v);
    }); };
    rmw([0xE6,0xF6,0xEE,0xFE],v=>(v+1)&255,[['ZP',3],['ZPX',4],['ABS',4],['ABX',7]]);
    rmw([0xC6,0xD6,0xCE,0xDE],v=>(v-1)&255,[['ZP',3],['ZPX',4],['ABS',4],['ABX',7]]);
    def([0xE8],'IMP',2,c=>{c.x=(c.x+1)&255;c.zn(c.x);});
    def([0xC8],'IMP',2,c=>{c.y=(c.y+1)&255;c.zn(c.y);});
    def([0xCA],'IMP',2,c=>{c.x=(c.x-1)&255;c.zn(c.x);});
    def([0x88],'IMP',2,c=>{c.y=(c.y-1)&255;c.zn(c.y);});
    const shift=(acc,mem,fn)=>{
      if(acc) def(acc,'ACC',2,c=>{const v=fn(c,c.a);c.a=v;c.zn(v);});
      if(mem) for(const [m,cy] of [['ZP',5],['ZPX',6],['ABS',6],['ABX',7]])
        def(mem,m,cy,(c,e)=>{const v=fn(c,c.read(e.addr));c.write(e.addr,v);c.zn(v);});
    };
    const asl=(c,v)=>{c.setf(1,(v&0x80)!==0);return (v<<1)&255;};
    const lsr=(c,v)=>{c.setf(1,(v&1)!==0);return v>>1;};
    const rol=(c,v)=>{const old=c.flag(1)?1:0;c.setf(1,(v&0x80)!==0);return ((v<<1)|old)&255;};
    const ror=(c,v)=>{const old=c.flag(1)?0x80:0;c.setf(1,(v&1)!==0);return (v>>1)|old;};
    shift([0x0A],[0x06,0x16,0x0E,0x1E],asl);
    shift([0x4A],[0x46,0x56,0x4E,0x5E],lsr);
    shift([0x2A],[0x26,0x36,0x2E,0x3E],rol);
    shift([0x6A],[0x66,0x76,0x6E,0x7E],ror);
    const br=(code,cond)=>def([code],'REL',2,(c,e)=>{
      if(!cond(c)) return 0;
      c.pc=e.addr; return e.cross?2:1;
    });
    br(0x10,c=>!c.flag(0x80)); br(0x30,c=>c.flag(0x80));
    br(0x50,c=>!c.flag(0x40)); br(0x70,c=>c.flag(0x40));
    br(0x90,c=>!c.flag(1));   br(0xB0,c=>c.flag(1));
    br(0xD0,c=>!c.flag(2));   br(0xF0,c=>c.flag(2));
    def([0x4C],'ABS',3,(c,e)=>{c.pc=e.addr;});
    def([0x6C],'IND',5,(c,e)=>{c.pc=e.addr;});
    def([0x20],'ABS',6,(c,e)=>{
      const ret = (c.pc - 1) & 0xFFFF;
      c.push((ret >> 8) & 255);
      c.push(ret & 255);
      c.pc = e.addr;
    });
    def([0x60],'IMP',6,c=>{
      c.pc = (c.pull() | (c.pull() << 8)) + 1;
      c.pc &= 0xFFFF;
    });
    def([0x40],'IMP',6,c=>{c.p=(c.pull()&0xff)|0x20;c.pc=c.pull()|(c.pull()<<8);});
    def([0x00],'IMP',7,c=>{c.pc=(c.pc+1)&0xffff;c.push((c.pc>>8)&255);c.push(c.pc&255);c.push((c.p&0xff)|0x30);c.setf(0x04,true);c.pc=c.rd16(0xFFFE);});
    def([0x48],'IMP',3,c=>c.push(c.a));
    def([0x08],'IMP',3,c=>c.push((c.p&0xff)|0x20));
    def([0x68],'IMP',4,c=>{c.a=c.pull();c.zn(c.a);});
    def([0x28],'IMP',4,c=>{c.p=(c.pull()&0xff)|0x20;});
    def([0xAA],'IMP',2,c=>{c.x=c.a;c.zn(c.x);});
    def([0x8A],'IMP',2,c=>{c.a=c.x;c.zn(c.a);});
    def([0xA8],'IMP',2,c=>{c.y=c.a;c.zn(c.y);});
    def([0x98],'IMP',2,c=>{c.a=c.y;c.zn(c.a);});
    def([0xBA],'IMP',2,c=>{c.x=c.sp;c.zn(c.x);});
    def([0x9A],'IMP',2,c=>{c.sp=c.x;});
    def([0xEA],'IMP',1,()=>{});
    def([0xA3], 'INDX', 6, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, false);
    def([0xA7], 'ZP', 3, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, false);
    def([0xAF], 'ABS', 4, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, false);
    def([0xB3], 'INDY', 5, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, true);
    def([0xB7], 'ZPY', 4, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, false);
    def([0xBF], 'ABY', 4, (c,e)=>{c.a=c.x=e.val;c.zn(c.a);}, true);
    const dcp = (c,e) => {
      const v=(c.read(e.addr)-1)&255;
      c.write(e.addr,v);
      const s=c.a-v;
      c.setf(1,s>=0);
      c.zn(s&255);
    };
    def([0xC3], 'INDX', 8, dcp, false);
    def([0xC7], 'ZP', 5, dcp, false);
    def([0xCF], 'ABS', 6, dcp, false);
    def([0xD3], 'INDY', 8, dcp, true);
    def([0xD7], 'ZPX', 6, dcp, false);
    def([0xDB], 'ABY', 7, dcp, true);
    def([0xDF], 'ABX', 7, dcp, true);
    const isb = (c,e) => {
      const v=(c.read(e.addr)+1)&255;
      c.write(e.addr,v);
      const s=c.a+(v^255)+(c.flag(1)?1:0);
      c.setf(0x40,((c.a^v)&(c.a^s)&0x80)!==0);
      c.a=s&255;
      c.setf(1,s>255);
      c.zn(c.a);
    };
    def([0xE3], 'INDX', 8, isb, false);
    def([0xE7], 'ZP', 5, isb, false);
    def([0xEF], 'ABS', 6, isb, false);
    def([0xF3], 'INDY', 8, isb, true);
    def([0xF7], 'ZPX', 6, isb, false);
    def([0xFB], 'ABX', 7, isb, true);
    def([0xFF], 'ABY', 7, isb, true);
    def([0x87], 'ZP', 3, (c,e)=>c.write(e.addr,c.a&c.x), false);
    def([0x97], 'ZPY', 4, (c,e)=>c.write(e.addr,c.a&c.x), false);
    def([0x83], 'INDX', 6, (c,e)=>c.write(e.addr,c.a&c.x), false);
    def([0x8F], 'ABS', 4, (c,e)=>c.write(e.addr,c.a&c.x), false);
    def([0x93], 'INDY', 6, (c,e)=>c.write(e.addr,c.a&c.x), true);
  }
  reset(){
    this.pc=this.rd16(0xFFFC); this.sp=0xFD; this.p=0x24; this.a=this.x=this.y=0;
    this.irqPending=false; this.nmiPending=false;
  }
  step(){
    if(this.nmiPending){ this.nmiPending=false; this.push((this.pc>>8)&255);this.push(this.pc&255);this.push(this.p&~0x10);this.setf(0x04,true);this.pc=this.rd16(0xFFFA);return 7; }
    if(this.irqPending&&!this.flag(0x04)){ this.irqPending=false; this.push((this.pc>>8)&255);this.push(this.pc&255);this.push(this.p&~0x10);this.setf(0x04,true);this.pc=this.rd16(0xFFFE);return 7; }
    const op=this.ops[this.read(this.pc)];
    this.pc=(this.pc+1)&0xffff;
    let e={addr:0,val:0,cross:false};
    if(!['IMP','ACC'].includes(op.mode)) e=this.ea(op.mode);
    if(op.mode==='ACC') e.val=this.a;
    const extra=op.fn(this,e)||0;
    const cycles=op.cycles+(op.page&&e.cross?1:0)+extra;
    this.cycles+=cycles;
    return cycles;
  }
}

/* ==========================================================================
* PPU 🕹️ Ricoh 2C02  (ENHANCED DEBUG BUILD - FIXED SCANLINE RENDERING)
* ========================================================================*/
class PPU2C02 {
  constructor(nes){
    this.nes=nes;
    this.vram=new Uint8Array(0x2000);
    this.palette=new Uint8Array([
      0x09, 0x01, 0x00, 0x01, 0x00, 0x02, 0x02, 0x0D, 0x08, 0x10, 0x08, 0x24, 0x00, 0x00, 0x04, 0x2C,
      0x09, 0x01, 0x34, 0x03, 0x00, 0x04, 0x00, 0x14, 0x08, 0x3A, 0x00, 0x02, 0x00, 0x20, 0x2C, 0x08
    ]);
    this.oam=new Uint8Array(256);
    this.output=new Uint8ClampedArray(256*240*4);
    this.ctrl=0;this.mask=0;this.status=0;this.v=0;this.t=0;this.x=0;this.w=0;
    this.buffer=0;this.oamAddr=0;this.cycle=0;this.scanline=0;this.frame=0;
    this.spriteList=[];
    this.onTile=null; this.onSprite=null; this.onFrame=null;
    this._ntWrites = 0;
    this._palWrites = 0;
    this._scrollWrites = 0;
    this._tileLog = [];
    this._openBus = 0;
  }
  reset(){ 
    this.v=this.t=this.x=this.w=0;this.ctrl=this.mask=this.status=0;this.cycle=this.scanline=0;this.frame=0;
    this._ntWrites=0; this._palWrites=0; this._scrollWrites=0; this._tileLog=[];
    this._openBus=0;
  }
  mirrorIndex(a){
    const m=this.nes.mapper.mirror;
    if(m===2) return ((a>>10)&1); // Vertical mirroring
    if(m===3) return ((a>>11)&1); // Horizontal mirroring
    if(m===4) return (a>>10)&3;
    return m&1;
  }
  readVRAM(a){
    a&=0x3fff;
    if(a<0x2000) return this.nes.mapper.chrRead(a);
    if(a>=0x3F00){
      const p=a&0x1f;
      if(p===0x10||p===0x14||p===0x18||p===0x1c) return this.palette[0];
      return this.palette[p];
    }
    const idx = this.mirrorIndex(a);
    return this.vram[(idx & 3) * 1024 + (a & 0x3FF)];
  }
  writeVRAM(a,v){
    a&=0x3fff; v&=255;
    if(a>=0x3F00){
      let p=a&0x1f;
      if(p>=0x10&&(p&3)===0) p=0;
      this.palette[p]=v&0x3f;
      this._palWrites++;
      return;
    }
    if(a<0x2000){ this.nes.mapper.chrWrite(a,v); return; }
    const idx = this.mirrorIndex(a);
    this.vram[(idx & 3) * 1024 + (a & 0x3FF)] = v;
    this._ntWrites++;
  }
  oamWrite(a,v){ this.oam[a&0xff]=v; }
  dma(addr){ for(let i=0;i<256;i++) this.oam[(this.oamAddr+i)&0xff]=this.nes.cpuRead((addr+i)&0xffff); }
  write(reg,v){
    switch(reg){
      case 0:
        this.ctrl=v;
        this.t = (this.t & ~0x0C00) | ((v & 0x03) << 10);
        break;
      case 1:
        this.mask=v;
        break;
      case 2: break;
      case 3: this.oamAddr=v&0xff; break;
      case 4: this.oam[this.oamAddr++ &0xff]=v; break;
      case 5:
        if(this.w===0){
          this.x = v & 0x07;
          this.t = (this.t & ~0x001F) | ((v >> 3) & 0x1F);
        } else {
          this.t = (this.t & ~0x73E0) | ((v & 0x07) << 12) | ((v & 0xF8) << 2);
        }
        this.w ^= 1;
        this._scrollWrites++;
        break;
      case 6:
        if(this.w===0){
          this.t = (this.t & ~0x00FF) | ((v & 0x3F) << 8);
        } else {
          this.t = (this.t & ~0xFF00) | v;
          this.v = this.t;
        }
        this.w ^= 1;
        this._scrollWrites++;
        break;
      case 7:
        this.writeVRAM(this.v & 0x3FFF, v);
        this.v = (this.v + ((this.ctrl & 4) ? 32 : 1)) & 0x7FFF;
        break;
    }
  }
  read(reg){
    switch(reg){
      case 0: return this._openBus;
      case 1: return this._openBus;
      case 2: {
        const s = this.status;
        this.status &= ~0x80;
        this.w = 0;
        this._openBus = (this._openBus & 0x1F) | (s & 0xE0);
        return this._openBus;
      }
      case 3: return this._openBus;
      case 4: {
        const val = this.oam[this.oamAddr];
        if(this.oamAddr & 3) {
          return this._openBus;
        }
        this._openBus = val;
        return val;
      }
      case 5: return this._openBus;
      case 6: return this._openBus;
      case 7: {
        let v = this.buffer;
        const a = this.v & 0x3FFF;
        if (a >= 0x3F00) {
          v = this.readVRAM(a);
          this.buffer = this.readVRAM(a - 0x1000);
        } else {
          this.buffer = this.readVRAM(a);
        }
        this.v = (this.v + ((this.ctrl & 4) ? 32 : 1)) & 0x7FFF;
        this._openBus = v;
        return v;
      }
    }
    return this._openBus;
  }
  evalSprites(){
    this.spriteList=[];
    if(!(this.mask&0x10)) return;
    const h=(this.ctrl&0x20)?16:8;
    for(let i=0;i<256;i+=4){
      const y=this.oam[i];
      const row=this.scanline-y;
      if(row>=0&&row<h){
        this.spriteList.push(i);
        if(this.spriteList.length>=8){ this.status|=0x20; break; }
      }
    }
  }
  renderScanline(){
    const y = this.scanline;
    const bgOn = (this.mask & 0x08) !== 0;
    const spOn = (this.mask & 0x10) !== 0;
    const leftClip = (this.mask & 0x04) ? 0 : 8;
    const rowOut = y * 256;
    const startCoarseX = this.v & 0x1F;
    const startNametableX = (this.v >> 10) & 1;
    
    // FIX: Derive vertical scroll parameters robustly from scanline y and v register
    const baseCoarseY = (this.v >> 5) & 0x1F;
    const baseFineY = (this.v >> 12) & 7;
    const totalY = (baseCoarseY * 8) + baseFineY + y;
    const coarseY = (totalY >> 3) & 0x1F;
    const fineY = totalY & 7;
    const nametableY = (((this.v >> 11) & 1) + Math.floor(totalY / 240)) & 1;

    const fineX = this.x;
    const patternBase = (this.ctrl & 0x10) ? 0x1000 : 0;
    const bgPx = new Uint8Array(256);
    const bgPal = new Uint8Array(256);
    
    for(let x = 0; x < 256; x++){
      const eff = x + fineX;
      const lx = eff & 7;
      const tileIndex = eff >> 3;
      let currentCoarseX = (startCoarseX + tileIndex) & 0x1F;
      let currentNametableX = startNametableX;
      if (startCoarseX + tileIndex >= 32) {
        currentNametableX ^= 1;
      }
      const ntAddr = 0x2000 | (currentNametableX << 10) | (nametableY << 11) | (coarseY << 5) | currentCoarseX;
      
      if(!bgOn || x < leftClip){
        const col = PALETTE[this.palette[0] & 0x3F];
        this.output[(rowOut+x)*4]   = col & 255;
        this.output[(rowOut+x)*4+1] = (col >>> 8) & 255;
        this.output[(rowOut+x)*4+2] = (col >>> 16) & 255;
        this.output[(rowOut+x)*4+3] = (col >>> 24) & 255;
        bgPx[x] = 0;
      } else {
        const tile = this.readVRAM(ntAddr);
        const attrAddr = 0x23C0 | (currentNametableX << 10) | (nametableY << 11) | ((coarseY >> 2) << 3) | (currentCoarseX >> 2);
        const attr = this.readVRAM(attrAddr);
        const shift = ((currentCoarseX & 2) | ((coarseY & 2) << 1));
        const pal = (attr >> shift) & 3;
        const addr = patternBase + tile * 16 + fineY;
        const lo = this.readVRAM(addr);
        const hi = this.readVRAM(addr + 8);
        const bit = 7 - lx;
        const px = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
        bgPx[x] = px;
        bgPal[x] = pal;
        let pAddr = px === 0 ? 0 : (pal << 2) | px;
        const col = PALETTE[this.palette[pAddr & 0x1F]];
        this.output[(rowOut+x)*4]   = col & 255;
        this.output[(rowOut+x)*4+1] = (col >>> 8) & 255;
        this.output[(rowOut+x)*4+2] = (col >>> 16) & 255;
        this.output[(rowOut+x)*4+3] = (col >>> 24) & 255;
        
        if(this.onTile && lx === 0){
          this.onTile({id:tile, x:currentCoarseX, y:coarseY, screenX:x, screenY:y, palette:pal, pattern:addr});
        }
      }
    }
    if(!spOn) return;
    const h = (this.ctrl & 0x20) ? 16 : 8;
    for(let s = 0; s < this.spriteList.length; s++){
      const i = this.spriteList[s];
      const sx = this.oam[i+2], attr = this.oam[i+3], sy = this.oam[i];
      let row = y - sy;
      if(attr & 0x80) row = h - 1 - row;
      let tile = this.oam[i+1];
      if(h === 16){
        tile = (tile & 0xFE) + (row >= 8 ? 1 : 0);
        row &= 7;
      }
      const patternBaseSp = (attr & 0x08) ? 0x1000 : 0;
      const addr = patternBaseSp + tile * 16 + row;
      const lo = this.readVRAM(addr), hi = this.readVRAM(addr + 8);
      for(let k = 0; k < 8; k++){
        const lx = (attr & 0x40) ? 7 - k : k;
        const x = sx + lx;
        if(x < 0 || x > 255 || x < leftClip) continue;
        const bit = 7 - lx;
        const px = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
        if(px === 0) continue;
        if(i === 0 && bgPx[x] !== 0 && (this.mask & 0x18) === 0x18) this.status |= 0x40;
        if((attr & 0x20) && bgPx[x] !== 0) continue;
        const pAddr = 0x10 | ((attr & 3) << 2) | px;
        const col = PALETTE[this.palette[pAddr & 0x1F]];
        this.output[(rowOut+x)*4]   = col & 255;
        this.output[(rowOut+x)*4+1] = (col >>> 8) & 255;
        this.output[(rowOut+x)*4+2] = (col >>> 16) & 255;
        this.output[(rowOut+x)*4+3] = (col >>> 24) & 255;
        if(this.onSprite && k === 0){
          this.onSprite({index:i>>2, id:this.oam[i+1], x:sx, y:sy, attr, row});
        }
      }
    }
  }
  clock(dots){ for(let i=0;i<dots;i++) this.tick(); }
  tick(){
    const c=this.cycle, sl=this.scanline;
    
    if(sl===0 && c===0){
      for(let i=0; i<this.output.length; i+=4){
        this.output[i]=0;
        this.output[i+1]=0;
        this.output[i+2]=0;
        this.output[i+3]=255;
      }
    }
    
    if(sl<240 && c===256){
      this.renderScanline();
    }
    
    if(sl<240 && c===257) this.evalSprites();
    if(sl<240 && c===257){
      this.v = (this.v & ~0x041F) | (this.t & 0x041F);
    }
    
    if(sl<240 && c===256){
      if((this.v & 0x7000) !== 0x7000) {
        this.v += 0x1000;
      } else {
        this.v &= ~0x7000;
        let y = (this.v >> 5) & 31;
        if(y === 29){ y = 0; this.v ^= 0x0800; }
        else if(y === 31) y = 0;
        else y++;
        this.v = (this.v & ~0x03E0) | (y << 5);
      }
    }
    
    if(sl===261 && c>=280 && c<=304){
      this.v = (this.v & ~0x3FE0) | (this.t & 0x3FE0);
    }
    
    if(sl===241 && c===1){ this.status |= 0x80; if(this.ctrl&0x80) this.nes.cpu.nmi(); }
    if(sl===261 && c===1){ this.status &= 0x1F; this.w = 0; }
    
    this.cycle++;
    if(this.cycle >= 341){
      this.cycle = 0; this.scanline++;
      if(this.scanline >= 262){
        this.scanline = 0; this.frame++;
        if(this.onFrame) this.onFrame(this.frame, this.output);
      }
    }
  }
  
  getDebugInfo(){
    return {
      frame: this.frame,
      scanline: this.scanline,
      cycle: this.cycle,
      ctrl: this.ctrl,
      mask: this.mask,
      status: this.status,
      v: this.v,
      t: this.t,
      x: this.x,
      w: this.w,
      ntWrites: this._ntWrites,
      palWrites: this._palWrites,
      scrollWrites: this._scrollWrites,
      uniqueTiles: this._tileLog.length,
      bgOn: (this.mask & 0x8) !== 0,
      sprOn: (this.mask & 0x10) !== 0
    };
  }
}

/* ==========================================================================
* APU 🕹️  2A03 (2 pulse, triangle, noise, DMC) + sample mixer
* ========================================================================*/
class Pulse {
  constructor(nes,id){this.nes=nes;this.id=id;this.regs=new Uint8Array(4);this.len=0;this.env=0;this.envStart=0;this.envDiv=0;this.phase=0;this.timer=0;this.enabled=false;this.sweep=0;this.swDiv=0;this.swNeg=false;}
  write(i,v){
    this.regs[i]=v;
    if(i===0){this.envStart=v>>4;this.envDiv=v&3;}
    if(i===1){this.sweep=v;}
    if(i===2){this.timer=(this.timer&0xff00)|v;}
    if(i===3){
      this.timer=(this.timer&0xff)|((v&7)<<8);
      this.len=[10,254,20,2,40,4,60,6,80,8,100,10,120,12,140,14][(v>>3)&15];
      this.env=this.envStart;this.envDiv=this.envStart;this.phase=0;this.enabled=true;this.swDiv=(this.sweep>>4)&7;this.swNeg=false;
      this.nes.apu.sound(this.id,'pulse',this.timer);
    }
  }
  half(envelope,sweep){
    if(sweep&&(this.sweep&0x80)&&this.swDiv===0){
      const ch=this.sweep&7, neg=(this.sweep&8)!==0;
      if(ch&&this.timer>=8){
        const delta=this.timer>>ch;
        if(neg){this.timer-=delta-(this.id===0?1:0);this.swNeg=true;}
        else this.timer+=delta;
        if(this.timer>0x7ff) this.enabled=false;
      }
      this.swDiv=(this.sweep>>4)&7;
    } else if(sweep) this.swDiv--;
    if(envelope){
      if(this.envDiv>0) this.envDiv--;
      else{this.envDiv=this.regs[0]&3;if(this.env>0)this.env--;else if(this.regs[0]&0x20)this.env=15;}
    }
  }
  tick(){ if(this.timer>0)this.timer--;else{this.timer=((this.regs[3]&7)<<8)|this.regs[2];this.phase=(this.phase+1)&7;} }
  out(){
    if(!this.enabled||this.len===0||this.timer<8) return 0;
    const dutySeq = [
      [0,1,0,0,0,0,0,0],
      [0,1,1,0,0,0,0,0],
      [0,1,1,1,1,0,0,0],
      [1,0,0,1,1,1,1,1]
    ];
    if(dutySeq[(this.regs[0]>>6)&3][this.phase] === 0) return 0;
    const vol=this.regs[0]&0x20?(this.regs[0]&15):this.env;
    return vol === 0 ? 0 : (95.52 / (8128 / vol + 100)) * 0.6;
  }
}

class Triangle {
  constructor(nes){this.nes=nes;this.regs=new Uint8Array(4);this.len=0;this.linear=0;this.timer=0;this.phase=0;this.enabled=false;}
  write(i,v){this.regs[i]=v;
    if(i===0)this.linear=v&0x7f;
    if(i===2)this.timer=(this.timer&0xff00)|v;
    if(i===3){this.timer=(this.timer&0xff)|((v&7)<<8);this.len=[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30][(v>>3)&15];this.enabled=true;this.nes.apu.sound('tri','triangle',this.timer);}
  }
  half(){ if(this.linear>0&&this.len>0)this.linear--; if(!(this.regs[0]&0x80))this.linear=0; }
  tick(){if(this.timer>0)this.timer--;else{this.timer=((this.regs[3]&7)<<8)|this.regs[2];this.phase=(this.phase+1)&32;}}
  out(){if(!this.enabled||this.len===0||this.linear===0)return 0;const seq=[15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];return (seq[this.phase]/15)*0.4;}
}

class Noise {
  constructor(nes){this.nes=nes;this.regs=new Uint8Array(4);this.len=0;this.env=0;this.envDiv=0;this.envStart=0;this.shift=1;this.timer=0;}
  write(i,v){this.regs[i]=v;
    if(i===0){this.envStart=v>>4;this.envDiv=v&3;}
    if(i===3){this.len=[10,254,20,2,40,4,60,6,80,8,100,10,120,12,140,14][(v>>3)&15];this.env=this.envStart;this.envDiv=this.envStart;}
  }
  half(env){if(env){if(this.envDiv>0)this.envDiv--;else{this.envDiv=this.regs[0]&3;if(this.env>0)this.env--;else if(this.regs[0]&0x20)this.env=15;}}}
  tick(){
    if(this.timer>0){this.timer--;return;}
    const rates=[4,8,16,32,64,96,128,160,202,254,380,508,762,1016,2034,4068];
    this.timer=rates[this.regs[2]&15]<<(this.regs[2]>>4);
    const bit=this.regs[2]&0x80?6:1;
    const fb=(this.shift&1)^((this.shift>>bit)&1);
    this.shift=(this.shift>>1)|(fb<<14);
  }
  out(){if(this.len===0||(this.shift&1))return 0;const v=this.regs[0]&0x20?(this.regs[0]&15):this.env;return v/15*0.3;}
}

class DMC {
  constructor(nes){this.nes=nes;this.regs=new Uint8Array(4);this.enabled=false;this.irq=false;this.level=0;this.timer=0;this.addr=0;this.len=0;this.bits=0;this.buf=0;this.sample=false;}
  write(i,v){this.regs[i]=v;
    if(i===0)this.irq=(v&0x40)!==0;
    if(i===1)this.level=v&127;
    if(i===2)this.addr=0xC000+v*64;
    if(i===3){this.len=[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30][(v>>3)&15]*16+1;if(!(v&0x80))this.enabled=false;else if(!this.enabled){this.enabled=true;this.start();}}
  }
  start(){if(this.len===0){this.addr=this.addr;this.len=[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30][(this.regs[3]>>3)&15]*16+1;}this.sample=true;}
  tick(){
    const rates=[428,380,340,320,286,254,226,214,190,160,142,128,106,84,72,54];
    if(this.timer>0){this.timer--;return;}
    this.timer=rates[this.regs[2]&15];
    if(this.bits===0&&this.len>0){
      this.buf=this.nes.cpuRead(this.addr);this.addr=(this.addr+1)&0xffff;if(this.addr===0x10000)this.addr=0x8000;this.len--;this.bits=8;
      if(this.len===0){if(this.regs[0]&0x40)this.nes.cpu.irq();if(this.regs[0]&0x20){this.addr=0xC000+this.regs[2]*64;this.len=[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30][(this.regs[3]>>3)&15]*16+1;}else this.enabled=false;}
    }
    if(this.bits>0){const out=this.buf&1;this.buf>>=1;this.bits--;this.level=Math.max(0,Math.min(127,this.level+(out?1:-1)));}
  }
  out(){return this.enabled?(this.level/127)*0.4:0;}
}

class APU2A03 {
  constructor(nes){
    this.nes=nes;
    this.pulse0=new Pulse(nes,'pulse1');this.pulse1=new Pulse(nes,'pulse2');
    this.tri=new Triangle(nes);this.noise=new Noise(nes);this.dmc=new DMC(nes);
    this.channels=[this.pulse0,this.pulse1,this.tri,this.noise,this.dmc];
    this.regs=new Uint8Array(0x18);
    this.writes=new Array(0x18).fill(()=>{});
    for(let i=0;i<4;i++){
      this.writes[0x00+i]=(v=>this.pulse0.write(i,v));
      this.writes[0x04+i]=(v=>this.pulse1.write(i,v));
      this.writes[0x08+i]=(v=>this.tri.write(i,v));
      this.writes[0x0C+i]=(v=>this.noise.write(i,v));
      this.writes[0x10+i]=(v=>this.dmc.write(i,v));
    }
    this.writes[0x15]=(v=>this.writeStatus(v));
    this.writes[0x17]=(v=>this.writeFrame(v));
    this.cycle=0;this.half=0;this.step=0;this.irqFlag=false;this.irqInhibit=false;this.mode=0;
    this.sampleAcc=0;this.samplePeriod=CPU_FREQ/44100;
    this.audio=new Float32Array(32768);this.aw=0;this.ar=0;
    this.onSound=null;this.onTrack=null;this.lastSound=0;
  }
  reset(){this.cycle=0;this.half=0;this.step=0;this.irqFlag=false;this.aw=this.ar=0;}
  sound(id,type,period){
    const now=this.nes.totalCycles;
    if(this.onSound) this.onSound({id,type,period,cycle:now});
    if(now-this.lastSound>FRAME_CYCLES*4&&this.onTrack){this.lastSound=now;this.onTrack({track:'sfx:'+id,channel:type});}
  }
  write(addr,v){const i=addr-0x4000;if(i>=0&&i<this.writes.length)this.writes[i](v&255);else if(addr===0x4014)this.nes.ppu.dma((v&255)<<8);}
  writeStatus(v){
    if(!(v&1))this.pulse0.enabled=false;if(!(v&2))this.pulse1.enabled=false;
    if(!(v&4))this.tri.enabled=false;if(!(v&8))this.noise.len=0;
    if(!(v&16))this.dmc.enabled=false;else this.dmc.start();
  }
  writeFrame(v){this.mode=(v>>7)&1;this.irqInhibit=(v&0x40)!==0;this.step=0;if(this.irqInhibit)this.irqFlag=false;}
  clock(cpuCycles){
    for(let i=0;i<cpuCycles;i++){
      this.cycle++;
      if((this.cycle&1)===0) this.halfTick();
      this.sampleAcc++;
      if(this.sampleAcc>=this.samplePeriod){this.sampleAcc-=this.samplePeriod;this.pushSample();}
    }
  }
  halfTick(){
    this.half++;
    this.pulse0.tick();this.pulse1.tick();this.tri.tick();this.noise.tick();this.dmc.tick();
    this.tri.half();
    if(this.half%3729!==0) return;
    this.step=(this.step+1)% (this.mode?5:4);
    const s=this.step;
    if(s===1||s===3){
      for(const p of [this.pulse0,this.pulse1]) if(p.len>0&&!(this.pulse0.regs[0]&0x20)) p.len--;
      if(this.tri.len>0&&!(this.tri.regs[0]&0x80))this.tri.len--;
      if(this.noise.len>0&&!(this.noise.regs[0]&0x20))this.noise.len--;
    }
    if(s===3||s===0){this.pulse0.half(true,false);this.pulse1.half(true,false);this.noise.half(true);}
    if(s===1||s===4){this.pulse0.half(false,true);}
    if(s===3&&!this.mode&&!this.irqInhibit){this.irqFlag=true;this.nes.cpu.irq();}
  }
  pushSample(){
    const s=this.pulse0.out()+this.pulse1.out()+this.tri.out()+this.noise.out()+this.dmc.out();
    this.audio[this.aw]=s;this.aw=(this.aw+1)%this.audio.length;
    if(this.aw===this.ar) this.ar=(this.ar+1)%this.audio.length;
  }
  readAudio(dst){
    let n=0;
    while(n<dst.length&&this.ar!==this.aw){dst[n++]=this.audio[this.ar];this.ar=(this.ar+1)%this.audio.length;}
    return n;
  }
}

/* ==========================================================================
* NES 🕹️  master clock + 64KB memory bus + I/O interception
* ========================================================================*/
export class NES {
  constructor(){
    this.ram=new Uint8Array(2048);
    this.cpu=new CPU6502(this);this.ppu=new PPU2C02(this);this.apu=new APU2A03(this);
    this.mapper=new NROM(this,new Uint8Array(16384),new Uint8Array(8192));
    this.buttons=0;this.strobe=0;this.shift=0;this.totalCycles=0;this.frameCycles=0;
    this.loaded=false;this.title='';
    this.onBusRead=null;this.onBusWrite=null;
    this.hasChrRam = false;
    this.debug = false;
  }
  cpuRead(a){
    let v;
    if(a<0x2000) v=this.ram[a&0x7ff];
    else if(a<0x4000) v=this.ppu.read(a&7);
    else if(a===0x4016){
      v = (this.shift & 1) | 0x40;
      if (!this.strobe) this.shift >>= 1;
      return v;
    }
    else if(a===0x4017){
      v=0x40;
    }
    else if(a<0x4020) v=0;
    else v=this.mapper.prgRead(a);
    if(this.onBusRead) this.onBusRead(a,v);
    return v;
  }
  cpuWrite(a,v){
    if(this.onBusWrite) this.onBusWrite(a,v);
    if(a<0x2000){this.ram[a&0x7ff]=v;return;}
    if(a<0x4000){this.ppu.write(a&7,v);return;}
    if(a===0x4014){this.ppu.dma((v&255)<<8);return;}
    if(a===0x4016){
      const prev=this.strobe;this.strobe=v&1;
      if(prev&&!this.strobe) this.shift=this.buttons;
      return;
    }
    if(a===0x4017) return;
    if(a<0x4020){this.apu.write(a,v);return;}
    this.mapper.prgWrite(a,v);
  }
  loadROM(buffer) {
    const d = new Uint8Array(buffer);
    if (d.length < 16 || d[0] !== 0x4E || d[1] !== 0x45 || d[2] !== 0x53 || d[3] !== 0x1A) {
      throw new Error('Not a valid iNES ROM (missing "NES\\x1A" header). The file may be headerless, corrupted, or raw binary.');
    }
    const flags6 = d[6];
    const flags7 = d[7];
    const isNes20 = (flags7 & 0x0C) === 0x08;
    let prgBanks = d[4];
    let chrBanks = d[5];
    if (isNes20 && d.length >= 16) {
      if (prgBanks === 0x0F) prgBanks = ((d[9] & 0x0F) << 8) | d[4];
      if (chrBanks === 0x0F) chrBanks = ((d[9] & 0xF0) << 4) | d[5];
    }
    const hasTrainer = (flags6 & 0x04) !== 0;
    const hasBattery = (flags6 & 0x02) !== 0;
    const mirror = (flags6 & 0x08) ? 4 : ((flags6 & 0x01) ? 2 : 3);
    let mapperID = ((flags7 & 0xF0) | ((flags6 & 0xF0) >> 4));
    if (isNes20 && d.length >= 16) {
      mapperID |= ((d[8] & 0x0F) << 8) | ((d[8] & 0xF0) << 4);
    }
    let offset = 16;
    if (hasTrainer) offset += 512;
    const prgLen = prgBanks * 16384;
    const chrLen = chrBanks * 8192;
    const expectedSize = offset + prgLen + chrLen;
    const extraBytes = d.length - expectedSize;
    if (d.length < expectedSize) {
      console.warn(`[NESJS] ROM is truncated. Expected ${expectedSize} bytes, got ${d.length}. Padding with zeros.`);
    }
    const prg = new Uint8Array(prgLen);
    const prgSlice = d.slice(offset, Math.min(offset + prgLen, d.length));
    prg.set(prgSlice, 0);
    const chr = new Uint8Array(Math.max(8192, chrLen));
    if (chrLen > 0) {
      const chrSlice = d.slice(offset + prgLen, Math.min(offset + prgLen + chrLen, d.length));
      chr.set(chrSlice, 0);
      this.hasChrRam = false;
    } else {
      this.hasChrRam = true;
    }
    const supportedMappers = [NROM, MMC1, UxROM, CNROM, MMC3];
    const cls = supportedMappers[mapperID];
    if (!cls) {
      throw new Error(`Unsupported Mapper: ${mapperID}. This emulator currently only supports Mappers 0, 1, 2, 3, and 4.`);
    }
    this.mapper = new cls(this, prg, chr);
    this.mapper.mirror = mirror;
    if(typeof this.mapper.reset === 'function') this.mapper.reset();
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
    this.totalCycles = 0;
    this.frameCycles = 0;
    this.loaded = true;
    this.title = `Mapper ${mapperID} ROM`;
    return this.title;
  }
  setButton(id,down){
    const bit=1<<id;
    if(down)this.buttons|=bit;else this.buttons&=~bit;
  }
  static BUTTONS={A:0,B:1,SELECT:2,START:3,UP:4,DOWN:5,LEFT:6,RIGHT:7};
  stepFrame(){
    if(!this.loaded) return;
    while(this.frameCycles<FRAME_CYCLES){
      const c=this.cpu.step();
      this.ppu.clock(c*3);
      this.apu.clock(c);
      if(this.mapper.clock) this.mapper.clock(c);
      this.frameCycles+=c;this.totalCycles+=c;
    }
    this.frameCycles-=FRAME_CYCLES;
  }
  stepCycles(n){
    if(!this.loaded) return;
    let total = 0;
    while(total < n){
      const c = this.cpu.step();
      this.ppu.clock(c*3);
      this.apu.clock(c);
      if(this.mapper.clock) this.mapper.clock(c);
      this.frameCycles+=c;this.totalCycles+=c;
      total += c;
    }
  }
  resetEmulator(){
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
    this.totalCycles = 0;
    this.frameCycles = 0;
  }
}

export default NES;
