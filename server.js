'use strict';
// Aventureiro ERP - versao de teste (SEM VALOR FISCAL - DEMONSTRACAO)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
const CODIGO = process.env.ERP_CODIGO || '';
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'erp.db'));
db.exec('PRAGMA journal_mode=WAL');

// ---------- utilidades ----------
const agora = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' '); // horario de Brasilia
const hoje = () => agora().slice(0, 10);
const cl = a => a.map(v => v === undefined ? null : typeof v === 'boolean' ? +v : v);
const aq = s => s.replace(/"([^"]*)"/g, "'$1'");
const q = (sql, ...p) => db.prepare(aq(sql)).all(...cl(p));
const q1 = (sql, ...p) => db.prepare(aq(sql)).get(...cl(p));
const run = (sql, ...p) => Number(db.prepare(aq(sql)).run(...cl(p)).lastInsertRowid);
const exec = (sql, ...p) => db.prepare(aq(sql)).run(...cl(p));
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const arred = v => Math.round((v + Number.EPSILON) * 100) / 100;
const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const soNum = s => String(s ?? '').replace(/\D/g, '');
const somaDias = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const somaMeses = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };
class Erro extends Error { constructor(m, c = 400, extra) { super(m); this.c = c; this.extra = extra; } }

// ---------- entidades simples (CRUD generico) ----------
const ENT = {
  clientes: { f: { papel: 'T', tipo: 'T', doc: 'T', razao: 'T', fantasia: 'T', ie: 'T', ind_ie: 'T', uf: 'T', cidade: 'T', cep: 'T', endereco: 'T', numero: 'T', bairro: 'T', email: 'T', fone: 'T' }, req: { razao: 'Razão social / nome' }, area: 'vendas' },
  produtos: { f: { sku: 'T', descricao: 'T', un: 'T', preco: 'R', custo: 'R', categoria: 'T', grupo_fiscal: 'T', est_min: 'R', origem: 'T', cest: 'T', ncm: 'T' }, req: { descricao: 'Descrição' }, area: 'vendas' },
  naturezas: { f: { nome: 'T', tipo: 'T', cfop_interno: 'T', cfop_inter: 'T', cfop_exterior: 'T', cst: 'T', obs: 'T', validado: 'R' }, req: { nome: 'Nome da natureza' }, area: 'fiscal' },
  ncm_tab: { f: { codigo: 'T', descricao: 'T' }, req: { codigo: 'Código NCM' }, area: 'fiscal' },
  cfop_tab: { f: { codigo: 'T', descricao: 'T' }, req: { codigo: 'Código CFOP' }, area: 'fiscal' },
  icms_regras: { f: { uf_origem: 'T', uf_destino: 'T', grupo_fiscal: 'T', aliquota: 'R', obs: 'T' }, req: { uf_origem: 'UF de origem', uf_destino: 'UF de destino' }, area: 'fiscal' },
  financeiro: { f: { tipo: 'T', descricao: 'T', parceiro: 'T', valor: 'R', venc: 'T', status: 'T', pago_em: 'T', origem: 'T' }, req: { descricao: 'Descrição', venc: 'Vencimento' }, area: 'financeiro' },
  chamados: { f: { assunto: 'T', mensagem: 'T', status: 'T', resposta: 'T', autor: 'T' }, req: { assunto: 'Assunto' }, area: 'suporte' },
};
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,email TEXT UNIQUE,salt TEXT,hash TEXT,criado TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,criado TEXT);
CREATE TABLE IF NOT EXISTS empresas(id INTEGER PRIMARY KEY AUTOINCREMENT,razao TEXT,fantasia TEXT,cnpj TEXT,ie TEXT,regime TEXT,uf TEXT,cidade TEXT,cep TEXT,endereco TEXT,numero TEXT,bairro TEXT,serie TEXT DEFAULT '1',prox_nfe INTEGER DEFAULT 1,cert_demo TEXT,plano TEXT DEFAULT 'teste',status_assin TEXT DEFAULT 'teste',trial_fim TEXT,criado TEXT);
CREATE TABLE IF NOT EXISTS membros(empresa_id INTEGER,user_id INTEGER,perfil TEXT,PRIMARY KEY(empresa_id,user_id));
CREATE TABLE IF NOT EXISTS docs(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,kind TEXT,numero INTEGER,cliente_id INTEGER,natureza_id INTEGER,status TEXT,itens TEXT,frete TEXT,pagamento TEXT,obs TEXT,total REAL DEFAULT 0,origem_id INTEGER,nfe_numero INTEGER,xml TEXT,data TEXT,criado TEXT,emitido_em TEXT);
CREATE TABLE IF NOT EXISTS estoque_mov(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,produto_id INTEGER,tipo TEXT,qtd REAL,motivo TEXT,doc_id INTEGER,data TEXT,criado TEXT);
CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,user_id INTEGER,usuario TEXT,acao TEXT,detalhe TEXT,quando TEXT);
`);
for (const [n, d] of Object.entries(ENT)) {
  const cols = Object.entries(d.f).map(([k, t]) => `${k} ${t === 'R' ? 'REAL' : 'TEXT'}`).join(',');
  db.exec(`CREATE TABLE IF NOT EXISTS ${n}(id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,criado TEXT,${cols})`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_${n}_emp ON ${n}(empresa_id)`);
}
db.exec('CREATE INDEX IF NOT EXISTS ix_docs_emp ON docs(empresa_id,kind)');
db.exec('CREATE INDEX IF NOT EXISTS ix_mov_emp ON estoque_mov(empresa_id,produto_id)');

function audit(c, acao, detalhe) {
  run('INSERT INTO auditoria(empresa_id,user_id,usuario,acao,detalhe,quando) VALUES(?,?,?,?,?,?)', c.emp ? c.emp.id : null, c.user ? c.user.id : null, c.user ? c.user.nome : '-', acao, detalhe || '', agora());
}

// ---------- seguranca ----------
function hashSenha(s, salt) { return crypto.scryptSync(s, salt, 32).toString('hex'); }
const tentativas = new Map();
function limite(ip) { const t = Date.now(); const a = (tentativas.get(ip) || []).filter(x => t - x < 600e3); a.push(t); tentativas.set(ip, a); return a.length > 30; }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); return o; }
function getUser(req) {
  const t = cookies(req).sid; if (!t) return null;
  return q1('SELECT u.id,u.nome,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?', t);
}
const AREAS = { Administrador: ['vendas', 'fiscal', 'financeiro', 'suporte', 'admin'], Financeiro: ['financeiro', 'suporte'], Vendedor: ['vendas', 'suporte'], Contador: [] };
function podeEscrever(c, area) { return c.perfil && (AREAS[c.perfil] || []).includes(area); }
function exige(c, area) { if (!podeEscrever(c, area)) throw new Erro(c.perfil === 'Contador' ? 'O perfil Contador é somente leitura.' : `Seu perfil (${c.perfil}) não tem permissão para esta ação.`, 403); }

// ---------- empresa / assinatura ----------
function emissaoLiberada(emp) {
  if (emp.status_assin === 'ativo') return null;
  if (emp.status_assin === 'teste') return emp.trial_fim >= hoje() ? null : 'O teste grátis de 7 dias terminou. Escolha um plano em Assinatura (simulado).';
  if (emp.status_assin === 'inadimplente') return 'Empresa bloqueada para emitir: assinatura inadimplente (simulado). Regularize em Assinatura.';
  return 'Assinatura cancelada. Reative em Assinatura (simulado) para emitir.';
}
const NATUREZAS_BASE = ['Venda de mercadoria', 'Venda de produção própria', 'Devolução de venda', 'Devolução de compra', 'Remessa para conserto', 'Retorno de conserto', 'Remessa para demonstração', 'Remessa em consignação', 'Remessa em bonificação / brinde', 'Transferência entre filiais', 'Importação', 'Exportação', 'Prestação de serviço (fora do modelo 55)'];
function criaEmpresa(c, b) {
  if (!String(b.razao || '').trim()) throw new Erro('Informe a razão social da empresa.');
  const id = run('INSERT INTO empresas(razao,fantasia,cnpj,ie,regime,uf,cidade,cep,endereco,numero,bairro,trial_fim,criado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    b.razao.trim(), b.fantasia || '', soNum(b.cnpj), b.ie || '', b.regime || 'Simples Nacional', (b.uf || '').toUpperCase(), b.cidade || '', b.cep || '', b.endereco || '', b.numero || '', b.bairro || '', somaDias(hoje(), 7), agora());
  run('INSERT INTO membros VALUES(?,?,?)', id, c.user.id, 'Administrador');
  for (const n of NATUREZAS_BASE) run('INSERT INTO naturezas(empresa_id,criado,nome,tipo,validado) VALUES(?,?,?,?,0)', id, agora(), n, 'Padrão (CFOP a validar)');
  c.emp = { id }; audit(c, 'Empresa criada', b.razao);
  return id;
}

// ---------- documentos ----------
const jp = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
function docOut(d) { return d && { ...d, itens: jp(d.itens, []), frete: jp(d.frete, {}), pagamento: jp(d.pagamento, {}) }; }
function calcItens(c, itens) {
  return (Array.isArray(itens) ? itens : []).filter(i => i && (i.descricao || i.produto_id)).map(i => {
    let p = i.produto_id ? q1('SELECT * FROM produtos WHERE id=? AND empresa_id=?', i.produto_id, c.emp.id) : null;
    const qtd = num(i.qtd) || 0, preco = i.preco === '' || i.preco == null ? num(p && p.preco) : num(i.preco);
    return { produto_id: p ? p.id : null, sku: p ? p.sku : (i.sku || ''), descricao: i.descricao || (p && p.descricao) || '', un: i.un || (p && p.un) || 'UN', ncm: i.ncm || (p && p.ncm) || '', grupo_fiscal: (p && p.grupo_fiscal) || '', qtd, preco, subtotal: arred(qtd * preco) };
  });
}
function salvaDoc(c, kind, b, id) {
  const itens = calcItens(c, b.itens), frete = b.frete || {}, pag = b.pagamento || {};
  const total = arred(itens.reduce((s, i) => s + i.subtotal, 0) + (kind === 'nfe' ? num(frete.valor_frete) : 0));
  if (b.cliente_id && !q1('SELECT 1 FROM clientes WHERE id=? AND empresa_id=?', b.cliente_id, c.emp.id)) throw new Erro('Cliente não encontrado nesta empresa.');
  if (id) {
    const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=?', id, c.emp.id);
    if (!d) throw new Erro('Documento não encontrado.', 404);
    if (d.status === 'emitida' || d.status === 'cancelada') throw new Erro('Este documento já foi finalizado e não pode ser alterado.');
    exec('UPDATE docs SET cliente_id=?,natureza_id=?,itens=?,frete=?,pagamento=?,obs=?,total=?,data=? WHERE id=?', b.cliente_id || null, b.natureza_id || null, JSON.stringify(itens), JSON.stringify(frete), JSON.stringify(pag), b.obs || '', total, b.data || d.data, id);
    audit(c, 'Documento alterado', `${kind} nº ${d.numero}`); return id;
  }
  const numero = (q1('SELECT MAX(numero) m FROM docs WHERE empresa_id=? AND kind=?', c.emp.id, kind).m || 0) + 1;
  const st = kind === 'orc' ? 'rascunho' : kind === 'ped' ? 'aberto' : 'previa';
  const nid = run('INSERT INTO docs(empresa_id,kind,numero,cliente_id,natureza_id,status,itens,frete,pagamento,obs,total,origem_id,data,criado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    c.emp.id, kind, numero, b.cliente_id || null, b.natureza_id || null, st, JSON.stringify(itens), JSON.stringify(frete), JSON.stringify(pag), b.obs || '', total, b.origem_id || null, b.data || hoje(), agora());
  audit(c, 'Documento criado', `${kind} nº ${numero}`); return nid;
}
function cfopDe(nat, ufEmit, ufDest) {
  if (!nat) return '';
  if (ufDest === 'EX') return nat.cfop_exterior || '';
  return (ufEmit && ufDest && ufEmit === ufDest ? nat.cfop_interno : nat.cfop_inter) || '';
}
function checaNfe(c, d) {
  const e = c.emp, cli = q1('SELECT * FROM clientes WHERE id=? AND empresa_id=?', d.cliente_id, e.id), nat = d.natureza_id ? q1('SELECT * FROM naturezas WHERE id=? AND empresa_id=?', d.natureza_id, e.id) : null;
  const itens = jp(d.itens, []), pag = jp(d.pagamento, {}), faltas = [], avisos = [];
  if (!soNum(e.cnpj)) faltas.push('Empresa emitente: informe o CNPJ (menu Empresa).');
  if (!e.uf) faltas.push('Empresa emitente: informe a UF (menu Empresa).');
  if (!e.ie) avisos.push('Empresa emitente sem Inscrição Estadual.');
  if (!cli) faltas.push('Escolha o destinatário (cliente).');
  else { if (!soNum(cli.doc)) faltas.push('Destinatário sem CNPJ/CPF.'); if (!cli.uf) faltas.push('Destinatário sem UF.'); }
  if (!itens.length) faltas.push('Adicione pelo menos um produto.');
  itens.forEach((i, n) => { if (!(i.qtd > 0)) faltas.push(`Item ${n + 1}: quantidade deve ser maior que zero.`); if (!i.ncm) avisos.push(`Item ${n + 1} (${i.descricao}): NCM A VALIDAR.`); });
  if (!nat) faltas.push('Escolha a natureza da operação.');
  else { const cf = cfopDe(nat, e.uf, cli && cli.uf); if (!cf) faltas.push(`A natureza "${nat.nome}" não tem CFOP para esta operação (${cli && cli.uf === e.uf ? 'interna' : 'interestadual'}). Preencha em Naturezas.`); if (!nat.validado) avisos.push('Cenário fiscal PENDENTE DE VALIDAÇÃO CONTÁBIL.'); }
  if (!pag.forma) faltas.push('Informe a forma de pagamento.');
  return { faltas, avisos, cli, nat, itens, pag };
}
function xmlNfe(c, d, cli, nat, itens, pag, nnf) {
  const e = c.emp, fr = jp(d.frete, {}), ufE = e.uf, ufD = cli.uf, cf = cfopDe(nat, ufE, ufD) || 'A VALIDAR';
  let tot = 0, totIcms = 0;
  const det = itens.map((i, n) => {
    const regra = q1('SELECT aliquota FROM icms_regras WHERE empresa_id=? AND uf_origem=? AND uf_destino=? AND (grupo_fiscal=? OR grupo_fiscal IS NULL OR grupo_fiscal="") ORDER BY (grupo_fiscal=?) DESC LIMIT 1', e.id, ufE, ufD, i.grupo_fiscal || '', i.grupo_fiscal || '');
    const aliq = regra && regra.aliquota != null ? regra.aliquota : null, v = aliq == null ? null : arred(i.subtotal * aliq / 100);
    tot += i.subtotal; if (v) totIcms += v;
    return `    <det nItem="${n + 1}">
      <prod><cProd>${esc(i.sku || i.produto_id || n + 1)}</cProd><xProd>${esc(i.descricao)}</xProd><NCM>${esc(i.ncm || 'A VALIDAR')}</NCM><CFOP>${esc(cf)}</CFOP><uCom>${esc(i.un)}</uCom><qCom>${i.qtd}</qCom><vUnCom>${i.preco.toFixed(2)}</vUnCom><vProd>${i.subtotal.toFixed(2)}</vProd></prod>
      <imposto><ICMS><CST>${esc(nat.cst || 'A VALIDAR')}</CST><pICMS>${aliq == null ? 'A VALIDAR' : aliq}</pICMS><vICMS>${v == null ? 'A VALIDAR' : v.toFixed(2)}</vICMS></ICMS></imposto>
    </det>`;
  }).join('\n');
  const vFrete = num(fr.valor_frete);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SEM VALOR FISCAL - DEMONSTRACAO. Este arquivo NAO e uma NF-e valida. Nao foi assinado nem enviado a SEFAZ. -->
<nfeDemo>
  <aviso>SEM VALOR FISCAL - DEMONSTRACAO</aviso>
  <infNFe>
    <ide><mod>55</mod><serie>${esc(e.serie)}</serie><nNF>${nnf}</nNF><dhEmi>${esc(agora().replace(' ', 'T'))}-03:00</dhEmi><natOp>${esc(nat.nome)}</natOp><chaveAcesso>NAO GERADA - DEMONSTRACAO</chaveAcesso></ide>
    <emit><CNPJ>${esc(soNum(e.cnpj))}</CNPJ><xNome>${esc(e.razao)}</xNome><IE>${esc(e.ie || 'A VALIDAR')}</IE><CRT>${esc(e.regime)}</CRT><UF>${esc(ufE)}</UF></emit>
    <dest><doc>${esc(soNum(cli.doc))}</doc><xNome>${esc(cli.razao)}</xNome><IE>${esc(cli.ie || '')}</IE><indIEDest>${esc(cli.ind_ie || '9')}</indIEDest><UF>${esc(ufD)}</UF></dest>
${det}
    <total><vProd>${tot.toFixed(2)}</vProd><vFrete>${vFrete.toFixed(2)}</vFrete><vICMS>${totIcms ? totIcms.toFixed(2) : 'A VALIDAR'}</vICMS><vNF>${(tot + vFrete).toFixed(2)}</vNF></total>
    <transp><modFrete>${esc(fr.modalidade || '9')}</modFrete><transporta>${esc(fr.transportadora || '')}</transporta><veiculo><placa>${esc(fr.placa || '')}</placa></veiculo><vol><qVol>${esc(fr.volumes || '')}</qVol><pesoB>${esc(fr.peso_b || '')}</pesoB><pesoL>${esc(fr.peso_l || '')}</pesoL></vol></transp>
    <pag><forma>${esc(pag.forma)}</forma><parcelas>${esc(pag.parcelas || 1)}</parcelas></pag>
    <infAdic><infCpl>SEM VALOR FISCAL - DEMONSTRACAO. ${esc(d.obs || '')}</infCpl></infAdic>
  </infNFe>
</nfeDemo>
`;
}
function emitir(c, id) {
  const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=? AND kind="nfe"', id, c.emp.id);
  if (!d) throw new Erro('Nota não encontrada.', 404);
  if (d.status === 'emitida') throw new Erro('Esta nota de demonstração já foi emitida.');
  const bloq = emissaoLiberada(c.emp); if (bloq) throw new Erro(bloq, 402);
  const r = checaNfe(c, d);
  if (r.faltas.length) throw new Erro('Faltam dados para emitir a nota de demonstração:', 422, { faltas: r.faltas, avisos: r.avisos });
  const nnf = c.emp.prox_nfe, xml = xmlNfe(c, d, r.cli, r.nat, r.itens, r.pag, nnf);
  db.exec('BEGIN');
  try {
    exec('UPDATE docs SET status="emitida",nfe_numero=?,xml=?,emitido_em=? WHERE id=?', nnf, xml, agora(), id);
    exec('UPDATE empresas SET prox_nfe=prox_nfe+1 WHERE id=?', c.emp.id);
    if (d.origem_id) exec('UPDATE docs SET status="faturado" WHERE id=? AND kind="ped"', d.origem_id);
    // financeiro: contas a receber
    const parc = Math.max(1, Math.min(48, parseInt(r.pag.parcelas) || 1)), v1 = r.pag.primeiro_venc || somaDias(hoje(), 30);
    let resto = d.total;
    for (let p = 0; p < parc; p++) {
      const v = p === parc - 1 ? arred(resto) : arred(d.total / parc); resto -= v;
      run('INSERT INTO financeiro(empresa_id,criado,tipo,descricao,parceiro,valor,venc,status,origem) VALUES(?,?,?,?,?,?,?,?,?)', c.emp.id, agora(), 'receber', `NF-e demo nº ${nnf} - parcela ${p + 1}/${parc}`, r.cli.razao, v, somaMeses(v1, p), 'aberto', 'nfe:' + id);
    }
    // estoque: saida automatica
    for (const i of r.itens) if (i.produto_id) run('INSERT INTO estoque_mov(empresa_id,produto_id,tipo,qtd,motivo,doc_id,data,criado) VALUES(?,?,?,?,?,?,?,?)', c.emp.id, i.produto_id, 'saida', -i.qtd, `Venda - NF-e demo nº ${nnf}`, id, hoje(), agora());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(c, 'NF-e de demonstração emitida', `nº ${nnf}`);
  return { ok: true, nfe_numero: nnf, avisos: r.avisos };
}

// ---------- rotas ----------
const R = [];
const rota = (m, re, fn) => R.push([m, new RegExp('^' + re + '$'), fn]);

rota('GET', '/api/saude', () => ({ ok: true, hora: agora() }));
rota('POST', '/api/auth/registrar', (c, b, req) => {
  if (limite(req.socket.remoteAddress)) throw new Erro('Muitas tentativas. Aguarde alguns minutos.', 429);
  if (CODIGO && String(b.codigo || '').trim() !== CODIGO) throw new Erro('Código de convite inválido. Peça o código a quem organizou o teste.', 403);
  const nome = String(b.nome || '').trim(), email = String(b.email || '').trim().toLowerCase();
  if (!nome) throw new Erro('Informe seu nome.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Erro('E-mail inválido. Confira se digitou corretamente.');
  if (String(b.senha || '').length < 6) throw new Erro('A senha precisa ter pelo menos 6 caracteres.');
  if (q1('SELECT 1 FROM users WHERE email=?', email)) throw new Erro('Este e-mail já tem cadastro. Use "Entrar".');
  const salt = crypto.randomBytes(16).toString('hex');
  const uid = run('INSERT INTO users(nome,email,salt,hash,criado) VALUES(?,?,?,?,?)', nome, email, salt, hashSenha(b.senha, salt), agora());
  c.setUser = uid; return { ok: true };
});
rota('POST', '/api/auth/entrar', (c, b, req) => {
  if (limite(req.socket.remoteAddress)) throw new Erro('Muitas tentativas. Aguarde alguns minutos.', 429);
  const u = q1('SELECT * FROM users WHERE email=?', String(b.email || '').trim().toLowerCase());
  if (!u || hashSenha(String(b.senha || ''), u.salt) !== u.hash) throw new Erro('E-mail ou senha incorretos.', 401);
  c.setUser = u.id; return { ok: true };
});
rota('POST', '/api/auth/sair', (c, b, req) => { const t = cookies(req).sid; if (t) exec('DELETE FROM sessions WHERE token=?', t); c.clearCookie = true; return { ok: true }; });
rota('GET', '/api/eu', (c) => {
  if (!c.user) return { user: null, codigo: !!CODIGO };
  const empresas = q('SELECT e.id,e.razao,e.fantasia,e.cnpj,e.uf,e.status_assin,m.perfil FROM membros m JOIN empresas e ON e.id=m.empresa_id WHERE m.user_id=? ORDER BY e.id', c.user.id);
  return { user: c.user, empresas, codigo: !!CODIGO };
});
rota('POST', '/api/empresas', (c, b) => { if (!c.user) throw new Erro('Faça login.', 401); return { id: criaEmpresa(c, b) }; });
rota('GET', '/api/empresa', (c) => { const e = { ...c.emp }; e.perfil = c.perfil; e.bloqueio = emissaoLiberada(c.emp); return e; });
rota('PUT', '/api/empresa', (c, b) => {
  exige(c, 'admin');
  const campos = ['razao', 'fantasia', 'cnpj', 'ie', 'regime', 'uf', 'cidade', 'cep', 'endereco', 'numero', 'bairro', 'serie', 'cert_demo'];
  const sets = [], vals = [];
  for (const k of campos) if (b[k] !== undefined) { sets.push(k + '=?'); vals.push(k === 'cnpj' ? soNum(b[k]) : k === 'uf' ? String(b[k]).toUpperCase() : b[k]); }
  if (b.prox_nfe !== undefined) { const n = parseInt(b.prox_nfe); if (n >= 1) { sets.push('prox_nfe=?'); vals.push(n); } }
  if (!sets.length) return { ok: true };
  exec(`UPDATE empresas SET ${sets.join(',')} WHERE id=?`, ...vals, c.emp.id); audit(c, 'Empresa alterada', ''); return { ok: true };
});
rota('GET', '/api/membros', (c) => q('SELECT u.id,u.nome,u.email,m.perfil FROM membros m JOIN users u ON u.id=m.user_id WHERE m.empresa_id=?', c.emp.id));
rota('POST', '/api/membros', (c, b) => {
  exige(c, 'admin');
  if (!AREAS[b.perfil]) throw new Erro('Perfil inválido.');
  const u = q1('SELECT id FROM users WHERE email=?', String(b.email || '').trim().toLowerCase());
  if (!u) throw new Erro('Essa pessoa ainda não tem cadastro. Peça para ela criar a conta primeiro e depois adicione aqui.');
  exec('INSERT OR REPLACE INTO membros VALUES(?,?,?)', c.emp.id, u.id, b.perfil); audit(c, 'Membro adicionado/alterado', `${b.email} como ${b.perfil}`); return { ok: true };
});
rota('DELETE', '/api/membros/(\\d+)', (c, b, req, m) => {
  exige(c, 'admin'); if (+m[1] === c.user.id) throw new Erro('Você não pode remover a si mesmo.');
  exec('DELETE FROM membros WHERE empresa_id=? AND user_id=?', c.emp.id, m[1]); audit(c, 'Membro removido', m[1]); return { ok: true };
});

// CRUD generico
function entOf(m) { const d = ENT[m[1]]; if (!d) throw new Erro('Cadastro desconhecido.', 404); return d; }
function limpa(d, b, old) {
  const o = {};
  for (const [k, t] of Object.entries(d.f)) if (b[k] !== undefined) o[k] = t === 'R' ? (b[k] === '' || b[k] === null ? null : num(b[k])) : String(b[k] ?? '').trim();
  return o;
}
function proxSku(c) { const r = q('SELECT sku FROM produtos WHERE empresa_id=?', c.emp.id); let m = 0; for (const x of r) { const n = parseInt(String(x.sku).replace(/\D/g, '')); if (n > m) m = n; } return 'SKU-' + String(m + 1).padStart(4, '0'); }
function ajustaEnt(c, nome, o, id) {
  if (nome === 'clientes') { if (o.doc !== undefined) o.doc = soNum(o.doc); if (o.uf) o.uf = o.uf.toUpperCase(); if (o.doc) { const dup = q1('SELECT id FROM clientes WHERE empresa_id=? AND doc=? AND id<>?', c.emp.id, o.doc, id || 0); if (dup) throw new Erro('Já existe um cadastro com este CNPJ/CPF nesta empresa.'); } }
  if (nome === 'produtos') {
    if (o.grupo_fiscal) { const g = q1('SELECT grupo_fiscal g FROM produtos WHERE empresa_id=? AND lower(grupo_fiscal)=lower(?) LIMIT 1', c.emp.id, o.grupo_fiscal); if (g) o.grupo_fiscal = g.g; }
    if (o.ncm) o.ncm = soNum(o.ncm);
    if (o.sku) { const dup = q1('SELECT id FROM produtos WHERE empresa_id=? AND sku=? AND id<>?', c.emp.id, o.sku, id || 0); if (dup) throw new Erro('Já existe um produto com este SKU.'); }
  }
  if (nome === 'ncm_tab' || nome === 'cfop_tab') { if (o.codigo) o.codigo = soNum(o.codigo); }
  if (nome === 'naturezas') delete o.validado;
  if (nome === 'financeiro') { if (o.tipo && !['receber', 'pagar'].includes(o.tipo)) throw new Erro('Tipo deve ser receber ou pagar.'); }
}
rota('GET', '/api/e/(\\w+)', (c, b, req, m, url) => {
  entOf(m); const lim = Math.min(+url.searchParams.get('limite') || 5000, 20000);
  return q(`SELECT * FROM ${m[1]} WHERE empresa_id=? ORDER BY id DESC LIMIT ${lim}`, c.emp.id);
});
rota('POST', '/api/e/(\\w+)', (c, b, req, m) => {
  const d = entOf(m); exige(c, d.area);
  const o = limpa(d, b); for (const [k, l] of Object.entries(d.req)) if (!o[k]) throw new Erro(`Preencha o campo "${l}".`);
  ajustaEnt(c, m[1], o);
  if (m[1] === 'produtos') { if (!o.sku) o.sku = proxSku(c); if (!o.un) o.un = 'UN'; }
  if (m[1] === 'naturezas') o.validado = 0;
  if (m[1] === 'financeiro') { o.tipo = o.tipo || 'receber'; o.status = 'aberto'; o.origem = 'manual'; }
  if (m[1] === 'chamados') { o.status = 'aberto'; o.autor = c.user.nome; }
  const ks = Object.keys(o), id = run(`INSERT INTO ${m[1]}(empresa_id,criado,${ks.join(',')}) VALUES(?,?,${ks.map(() => '?').join(',')})`, c.emp.id, agora(), ...ks.map(k => o[k]));
  audit(c, 'Cadastro criado', `${m[1]} #${id}`); return { id };
});
rota('PUT', '/api/e/(\\w+)/(\\d+)', (c, b, req, m) => {
  const d = entOf(m); const area = m[1] === 'chamados' ? 'suporte' : d.area; exige(c, area);
  const old = q1(`SELECT * FROM ${m[1]} WHERE id=? AND empresa_id=?`, m[2], c.emp.id); if (!old) throw new Erro('Registro não encontrado.', 404);
  const o = limpa(d, b); for (const [k, l] of Object.entries(d.req)) if (o[k] !== undefined && !o[k]) throw new Erro(`Preencha o campo "${l}".`);
  ajustaEnt(c, m[1], o, +m[2]);
  if (m[1] === 'financeiro') { delete o.status; delete o.pago_em; delete o.origem; }
  if (m[1] === 'naturezas' && old.validado) { /* alterar apos validar remove o selo */ o.validado = 0; }
  const ks = Object.keys(o); if (!ks.length) return { ok: true };
  exec(`UPDATE ${m[1]} SET ${ks.map(k => k + '=?').join(',')} WHERE id=? AND empresa_id=?`, ...ks.map(k => o[k]), m[2], c.emp.id);
  audit(c, 'Cadastro alterado', `${m[1]} #${m[2]}`); return { ok: true };
});
rota('DELETE', '/api/e/(\\w+)/(\\d+)', (c, b, req, m) => {
  const d = entOf(m); exige(c, d.area);
  if (m[1] === 'clientes' && q1('SELECT 1 FROM docs WHERE cliente_id=? AND empresa_id=?', m[2], c.emp.id)) throw new Erro('Este cliente já está em documentos e não pode ser apagado.');
  if (m[1] === 'produtos' && q1('SELECT 1 FROM estoque_mov WHERE produto_id=? AND empresa_id=?', m[2], c.emp.id)) throw new Erro('Este produto tem movimentação de estoque e não pode ser apagado.');
  exec(`DELETE FROM ${m[1]} WHERE id=? AND empresa_id=?`, m[2], c.emp.id); audit(c, 'Cadastro apagado', `${m[1]} #${m[2]}`); return { ok: true };
});
rota('POST', '/api/e/(\\w+)/bulk', (c, b, req, m) => {
  const d = entOf(m); exige(c, d.area);
  if (!['clientes', 'produtos', 'ncm_tab', 'cfop_tab'].includes(m[1])) throw new Erro('Importação não disponível para este cadastro.');
  const linhas = Array.isArray(b.linhas) ? b.linhas.slice(0, 50000) : []; let ok = 0; const erros = [];
  db.exec('BEGIN');
  try {
    linhas.forEach((l, n) => {
      try {
        const o = limpa(d, l); for (const [k, lab] of Object.entries(d.req)) if (!o[k]) throw new Erro(`Falta "${lab}"`);
        ajustaEnt(c, m[1], o);
        if (m[1] === 'ncm_tab' || m[1] === 'cfop_tab') { const ex = q1(`SELECT id FROM ${m[1]} WHERE empresa_id=? AND codigo=?`, c.emp.id, o.codigo); if (ex) { exec(`UPDATE ${m[1]} SET descricao=? WHERE id=?`, o.descricao || '', ex.id); ok++; return; } }
        if (m[1] === 'produtos') { if (!o.sku) o.sku = proxSku(c); if (!o.un) o.un = 'UN'; }
        if (m[1] === 'clientes' && o.doc) { const ex = q1('SELECT id FROM clientes WHERE empresa_id=? AND doc=?', c.emp.id, o.doc); if (ex) throw new Erro('CNPJ/CPF já cadastrado'); }
        const ks = Object.keys(o); run(`INSERT INTO ${m[1]}(empresa_id,criado,${ks.join(',')}) VALUES(?,?,${ks.map(() => '?').join(',')})`, c.emp.id, agora(), ...ks.map(k => o[k])); ok++;
      } catch (e) { if (erros.length < 50) erros.push(`Linha ${n + 1}: ${e.message}`); }
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(c, 'Importação', `${m[1]}: ${ok} linhas`); return { importados: ok, erros, total: linhas.length };
});
rota('POST', '/api/naturezas/(\\d+)/validar', (c, b, req, m) => {
  if (!['Administrador', 'Contador'].includes(c.perfil)) throw new Erro('Somente Administrador ou Contador podem validar um cenário fiscal.', 403);
  exec('UPDATE naturezas SET validado=? WHERE id=? AND empresa_id=?', b.validado ? 1 : 0, m[1], c.emp.id); audit(c, b.validado ? 'Cenário validado' : 'Validação removida', 'natureza #' + m[1]); return { ok: true };
});
rota('POST', '/api/chamados/(\\d+)/responder', (c, b, req, m) => {
  exige(c, 'suporte'); exec('UPDATE chamados SET resposta=?,status=? WHERE id=? AND empresa_id=?', String(b.resposta || ''), b.fechar ? 'fechado' : 'respondido', m[1], c.emp.id); audit(c, 'Chamado respondido', '#' + m[1]); return { ok: true };
});
rota('GET', '/api/ncm/buscar', (c, b, req, m, url) => {
  const t = String(url.searchParams.get('q') || '').trim(); if (!t) return [];
  const n = q1('SELECT COUNT(*) n FROM ncm_tab WHERE empresa_id=?', c.emp.id).n;
  const r = q('SELECT codigo,descricao FROM ncm_tab WHERE empresa_id=? AND (codigo LIKE ? OR descricao LIKE ?) LIMIT 30', c.emp.id, soNum(t) ? soNum(t) + '%' : '%' + t + '%', '%' + t + '%');
  return { tabela_vazia: n === 0, itens: r };
});

// documentos
rota('GET', '/api/docs', (c, b, req, m, url) => {
  const k = url.searchParams.get('kind');
  return q(`SELECT d.id,d.kind,d.numero,d.status,d.total,d.data,d.nfe_numero,d.origem_id,cl.razao cliente FROM docs d LEFT JOIN clientes cl ON cl.id=d.cliente_id WHERE d.empresa_id=? ${k ? 'AND d.kind=?' : ''} ORDER BY d.id DESC LIMIT 1000`, ...(k ? [c.emp.id, k] : [c.emp.id]));
});
rota('GET', '/api/docs/(\\d+)', (c, b, req, m) => {
  const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d) throw new Erro('Documento não encontrado.', 404);
  const o = docOut(d); delete o.xml; o.tem_xml = !!d.xml;
  o.cliente = d.cliente_id ? q1('SELECT * FROM clientes WHERE id=?', d.cliente_id) : null;
  o.natureza = d.natureza_id ? q1('SELECT * FROM naturezas WHERE id=?', d.natureza_id) : null;
  o.empresa = c.emp; if (d.kind === 'nfe') { const r = checaNfe(c, d); o.faltas = r.faltas; o.avisos = r.avisos; o.cfop = cfopDe(o.natureza, c.emp.uf, o.cliente && o.cliente.uf); }
  return o;
});
rota('POST', '/api/docs', (c, b) => { exige(c, 'vendas'); const k = b.kind; if (!['orc', 'ped', 'nfe'].includes(k)) throw new Erro('Tipo de documento inválido.'); return { id: salvaDoc(c, k, b) }; });
rota('PUT', '/api/docs/(\\d+)', (c, b, req, m) => { exige(c, 'vendas'); const d = q1('SELECT kind FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d) throw new Erro('Documento não encontrado.', 404); return { id: salvaDoc(c, d.kind, b, +m[1]) }; });
rota('DELETE', '/api/docs/(\\d+)', (c, b, req, m) => {
  exige(c, 'vendas'); const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d) throw new Erro('Documento não encontrado.', 404);
  if (d.status === 'emitida') throw new Erro('Nota já emitida não pode ser apagada. Use "Cancelar".');
  exec('DELETE FROM docs WHERE id=?', m[1]); audit(c, 'Documento apagado', `${d.kind} nº ${d.numero}`); return { ok: true };
});
rota('POST', '/api/docs/(\\d+)/converter', (c, b, req, m) => {
  exige(c, 'vendas'); const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d) throw new Erro('Documento não encontrado.', 404);
  const alvo = d.kind === 'orc' ? 'ped' : d.kind === 'ped' ? 'nfe' : null; if (!alvo) throw new Erro('Esta nota não gera outro documento.');
  if (d.kind === 'orc' && !jp(d.itens, []).length) throw new Erro('Adicione itens ao orçamento antes de gerar o pedido.');
  const novo = salvaDoc(c, alvo, { ...docOut(d), origem_id: d.id }),
    st = d.kind === 'orc' ? 'aprovado' : 'faturando';
  exec('UPDATE docs SET status=? WHERE id=?', st, d.id);
  if (alvo === 'nfe') { const p = jp(d.pagamento, {}); if (!p.forma) exec('UPDATE docs SET pagamento=? WHERE id=?', JSON.stringify({ forma: '', parcelas: 1, primeiro_venc: somaDias(hoje(), 30) }), novo); }
  return { id: novo, kind: alvo };
});
rota('POST', '/api/docs/(\\d+)/emitir', (c, b, req, m) => { exige(c, 'vendas'); return emitir(c, +m[1]); });
rota('POST', '/api/docs/(\\d+)/cancelar', (c, b, req, m) => {
  exige(c, 'vendas'); const d = q1('SELECT * FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d) throw new Erro('Documento não encontrado.', 404);
  if (d.status === 'cancelada') throw new Erro('Já está cancelado.');
  db.exec('BEGIN');
  try {
    exec('UPDATE docs SET status="cancelada" WHERE id=?', d.id);
    if (d.kind === 'nfe' && d.nfe_numero) {
      exec('UPDATE financeiro SET status="cancelado" WHERE empresa_id=? AND origem=? AND status="aberto"', c.emp.id, 'nfe:' + d.id);
      for (const i of jp(d.itens, [])) if (i.produto_id) run('INSERT INTO estoque_mov(empresa_id,produto_id,tipo,qtd,motivo,doc_id,data,criado) VALUES(?,?,?,?,?,?,?,?)', c.emp.id, i.produto_id, 'entrada', i.qtd, `Cancelamento NF-e demo nº ${d.nfe_numero}`, d.id, hoje(), agora());
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(c, 'Documento cancelado', `${d.kind} nº ${d.numero}`); return { ok: true };
});
rota('GET', '/api/docs/(\\d+)/xml', (c, b, req, m) => {
  const d = q1('SELECT xml,nfe_numero FROM docs WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!d || !d.xml) throw new Erro('Esta nota ainda não foi emitida (sem XML).', 404);
  c.raw = { tipo: 'application/xml; charset=utf-8', corpo: d.xml, nome: `nfe-demo-${d.nfe_numero}-SEM-VALOR-FISCAL.xml` }; return null;
});

// financeiro
rota('POST', '/api/financeiro/(\\d+)/baixar', (c, b, req, m) => {
  exige(c, 'financeiro'); const f = q1('SELECT * FROM financeiro WHERE id=? AND empresa_id=?', m[1], c.emp.id); if (!f) throw new Erro('Lançamento não encontrado.', 404);
  if (f.status !== 'aberto') throw new Erro('Este lançamento não está em aberto.');
  exec('UPDATE financeiro SET status="pago",pago_em=? WHERE id=?', b.data || hoje(), f.id); audit(c, 'Baixa de lançamento', `#${f.id} ${f.descricao}`); return { ok: true };
});
rota('POST', '/api/financeiro/(\\d+)/estornar', (c, b, req, m) => { exige(c, 'financeiro'); exec('UPDATE financeiro SET status="aberto",pago_em=NULL WHERE id=? AND empresa_id=? AND status="pago"', m[1], c.emp.id); audit(c, 'Baixa estornada', '#' + m[1]); return { ok: true }; });

// estoque
rota('GET', '/api/estoque', (c) => q('SELECT p.id,p.sku,p.descricao,p.un,p.est_min,p.custo,COALESCE(SUM(m.qtd),0) saldo FROM produtos p LEFT JOIN estoque_mov m ON m.produto_id=p.id WHERE p.empresa_id=? GROUP BY p.id ORDER BY p.descricao', c.emp.id));
rota('GET', '/api/estoque/mov', (c) => q('SELECT m.*,p.descricao,p.sku FROM estoque_mov m JOIN produtos p ON p.id=m.produto_id WHERE m.empresa_id=? ORDER BY m.id DESC LIMIT 300', c.emp.id));
rota('POST', '/api/compras', (c, b) => {
  exige(c, 'financeiro'); const itens = (b.itens || []).filter(i => i.produto_id && num(i.qtd) > 0);
  if (!itens.length) throw new Erro('Adicione pelo menos um produto com quantidade.');
  let total = 0; db.exec('BEGIN');
  try {
    for (const i of itens) {
      const p = q1('SELECT * FROM produtos WHERE id=? AND empresa_id=?', i.produto_id, c.emp.id); if (!p) throw new Erro('Produto não encontrado.');
      const custo = i.custo === '' || i.custo == null ? num(p.custo) : num(i.custo); total += num(i.qtd) * custo;
      run('INSERT INTO estoque_mov(empresa_id,produto_id,tipo,qtd,motivo,data,criado) VALUES(?,?,?,?,?,?,?)', c.emp.id, p.id, 'entrada', num(i.qtd), 'Compra' + (b.fornecedor ? ' - ' + b.fornecedor : ''), hoje(), agora());
      if (custo) exec('UPDATE produtos SET custo=? WHERE id=?', custo, p.id);
    }
    if (total > 0) run('INSERT INTO financeiro(empresa_id,criado,tipo,descricao,parceiro,valor,venc,status,origem) VALUES(?,?,?,?,?,?,?,?,?)', c.emp.id, agora(), 'pagar', 'Compra de mercadorias', b.fornecedor || '', arred(total), b.venc || somaDias(hoje(), 30), 'aberto', 'compra');
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(c, 'Compra registrada', `${itens.length} itens`); return { ok: true, total: arred(total) };
});
rota('POST', '/api/estoque/ajuste', (c, b) => {
  exige(c, 'vendas'); const p = q1('SELECT id FROM produtos WHERE id=? AND empresa_id=?', b.produto_id, c.emp.id); if (!p) throw new Erro('Produto não encontrado.');
  const qtd = num(b.qtd); if (!qtd) throw new Erro('Informe a quantidade (use sinal - para saída).');
  run('INSERT INTO estoque_mov(empresa_id,produto_id,tipo,qtd,motivo,data,criado) VALUES(?,?,?,?,?,?,?)', c.emp.id, p.id, 'ajuste', qtd, b.motivo || 'Ajuste manual', hoje(), agora()); audit(c, 'Ajuste de estoque', `produto #${p.id} ${qtd}`); return { ok: true };
});

// painel, relatorios, auditoria
rota('GET', '/api/painel', (c) => {
  const mes = hoje().slice(0, 7), id = c.emp.id;
  return {
    vendas_mes: q1('SELECT COALESCE(SUM(total),0) v FROM docs WHERE empresa_id=? AND kind="ped" AND status<>"cancelada" AND data LIKE ?', id, mes + '%').v,
    notas_mes: q1('SELECT COUNT(*) n FROM docs WHERE empresa_id=? AND kind="nfe" AND status="emitida" AND emitido_em LIKE ?', id, mes + '%').n,
    receber: q1('SELECT COALESCE(SUM(valor),0) v FROM financeiro WHERE empresa_id=? AND tipo="receber" AND status="aberto"', id).v,
    pagar: q1('SELECT COALESCE(SUM(valor),0) v FROM financeiro WHERE empresa_id=? AND tipo="pagar" AND status="aberto"', id).v,
    atrasadas: q1('SELECT COUNT(*) n FROM financeiro WHERE empresa_id=? AND status="aberto" AND venc<?', id, hoje()).n,
    estoque_baixo: q1('SELECT COUNT(*) n FROM (SELECT p.id,p.est_min,COALESCE(SUM(m.qtd),0) s FROM produtos p LEFT JOIN estoque_mov m ON m.produto_id=p.id WHERE p.empresa_id=? GROUP BY p.id) WHERE est_min>0 AND s<=est_min', id).n,
    atividades: q('SELECT usuario,acao,detalhe,quando FROM auditoria WHERE empresa_id=? ORDER BY id DESC LIMIT 8', id),
    bloqueio: emissaoLiberada(c.emp), status_assin: c.emp.status_assin, trial_fim: c.emp.trial_fim,
    tab_ncm: q1('SELECT COUNT(*) n FROM ncm_tab WHERE empresa_id=?', id).n, tab_cfop: q1('SELECT COUNT(*) n FROM cfop_tab WHERE empresa_id=?', id).n,
  };
});
rota('GET', '/api/auditoria', (c) => q('SELECT usuario,acao,detalhe,quando FROM auditoria WHERE empresa_id=? ORDER BY id DESC LIMIT 300', c.emp.id));
rota('GET', '/api/relatorios', (c) => {
  const id = c.emp.id;
  return {
    vendas_mes: q('SELECT substr(data,1,7) mes,COUNT(*) pedidos,SUM(total) total FROM docs WHERE empresa_id=? AND kind="ped" AND status<>"cancelada" GROUP BY mes ORDER BY mes DESC LIMIT 12', id),
    top_produtos: q(`SELECT json_extract(j.value,'$.descricao') produto,SUM(json_extract(j.value,'$.qtd')) qtd,SUM(json_extract(j.value,'$.subtotal')) total FROM docs d,json_each(d.itens) j WHERE d.empresa_id=? AND d.kind="nfe" AND d.status="emitida" GROUP BY produto ORDER BY total DESC LIMIT 10`, id),
    financeiro: q('SELECT tipo,status,COUNT(*) n,SUM(valor) total FROM financeiro WHERE empresa_id=? GROUP BY tipo,status', id),
    fluxo: q('SELECT substr(COALESCE(pago_em,venc),1,7) mes,tipo,status,SUM(valor) total FROM financeiro WHERE empresa_id=? AND status IN ("pago","aberto") GROUP BY mes,tipo,status ORDER BY mes', id),
    estoque_baixo: q('SELECT p.sku,p.descricao,p.est_min,COALESCE(SUM(m.qtd),0) saldo FROM produtos p LEFT JOIN estoque_mov m ON m.produto_id=p.id WHERE p.empresa_id=? GROUP BY p.id HAVING p.est_min>0 AND saldo<=p.est_min', id),
  };
});
// assinatura simulada
rota('POST', '/api/assinatura', (c, b) => {
  exige(c, 'admin'); const acoes = { ativar: 'ativo', inadimplir: 'inadimplente', cancelar: 'cancelado', teste: 'teste' };
  const st = acoes[b.acao]; if (!st) throw new Erro('Ação inválida.');
  if (b.acao === 'ativar' && !['mensal', 'semestral', 'anual'].includes(b.plano)) throw new Erro('Escolha um plano.');
  if (b.acao === 'teste') exec('UPDATE empresas SET status_assin=?,trial_fim=? WHERE id=?', st, somaDias(hoje(), 7), c.emp.id);
  else exec('UPDATE empresas SET status_assin=?,plano=COALESCE(?,plano) WHERE id=?', st, b.plano || null, c.emp.id);
  audit(c, 'Assinatura (simulada)', `${b.acao} ${b.plano || ''}`); return { ok: true };
});
// dados de exemplo
rota('POST', '/api/exemplo', (c) => {
  exige(c, 'admin'); const t = agora();
  if (!q1('SELECT 1 FROM clientes WHERE empresa_id=? AND doc=?', c.emp.id, '11111111000111')) run('INSERT INTO clientes(empresa_id,criado,papel,tipo,doc,razao,fantasia,ind_ie,uf,cidade,endereco,numero,bairro,cep,email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', c.emp.id, t, 'cliente', 'PJ', '11111111000111', 'CLIENTE EXEMPLO FICTÍCIO LTDA', 'Exemplo Fictício', '9', 'SP', 'São Paulo', 'Rua Fictícia', '100', 'Centro', '01000000', 'exemplo@exemplo.invalid');
  if (!q1('SELECT 1 FROM produtos WHERE empresa_id=? AND descricao LIKE "%EXEMPLO FICTÍCIO%"', c.emp.id)) { const pid = run('INSERT INTO produtos(empresa_id,criado,sku,descricao,un,preco,custo,categoria,est_min,origem) VALUES(?,?,?,?,?,?,?,?,?,?)', c.emp.id, t, proxSku(c), 'PRODUTO EXEMPLO FICTÍCIO', 'UN', 100, 60, 'Exemplo', 5, '0'); run('INSERT INTO estoque_mov(empresa_id,produto_id,tipo,qtd,motivo,data,criado) VALUES(?,?,?,?,?,?,?)', c.emp.id, pid, 'entrada', 20, 'Saldo inicial (exemplo)', hoje(), t); }
  audit(c, 'Dados de exemplo (fictícios) criados', ''); return { ok: true };
});

// ---------- servidor ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, nofollow' };
function lerCorpo(req) { return new Promise((ok, no) => { let s = ''; req.on('data', d => { s += d; if (s.length > 25e6) { no(new Erro('Arquivo muito grande.', 413)); req.destroy(); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Erro('Dados inválidos.')); } }); }); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const c = { user: getUser(req) }; let achou = null, m;
      for (const [mt, re, fn] of R) if (mt === req.method && (m = re.exec(url.pathname))) { achou = fn; break; }
      if (!achou) throw new Erro('Endereço não encontrado.', 404);
      const publico = ['/api/saude', '/api/auth/registrar', '/api/auth/entrar', '/api/auth/sair', '/api/eu', '/api/empresas'];
      if (!publico.includes(url.pathname)) {
        if (!c.user) throw new Erro('Sua sessão expirou. Entre novamente.', 401);
        const eid = +(req.headers['x-empresa'] || url.searchParams.get('e') || 0);
        const mem = eid && q1('SELECT m.perfil FROM membros m WHERE m.empresa_id=? AND m.user_id=?', eid, c.user.id);
        if (!mem) throw new Erro('Você não tem acesso a esta empresa.', 403);
        c.emp = q1('SELECT * FROM empresas WHERE id=?', eid); c.perfil = mem.perfil;
      }
      const b = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
      const r = achou(c, b, req, m, url);
      const h = { ...SEC, 'Cache-Control': 'no-store' };
      if (c.setUser) { const t = crypto.randomBytes(32).toString('hex'); run('INSERT INTO sessions VALUES(?,?,?)', t, c.setUser, agora()); h['Set-Cookie'] = `sid=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`; }
      if (c.clearCookie) h['Set-Cookie'] = 'sid=; Path=/; HttpOnly; Max-Age=0';
      if (c.raw) { res.writeHead(200, { ...h, 'Content-Type': c.raw.tipo, 'Content-Disposition': `attachment; filename="${c.raw.nome}"` }); return res.end(c.raw.corpo); }
      res.writeHead(200, { ...h, 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify(r));
    }
    let f = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.normalize(path.join(PUB, f));
    if (!full.startsWith(PUB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404, SEC); return res.end('Não encontrado'); }
    res.writeHead(200, { ...SEC, 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    if (!(e instanceof Erro)) console.error(e);
    const st = e instanceof Erro ? e.c : 500;
    res.writeHead(st, { ...SEC, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erro: e instanceof Erro ? e.message : 'Erro inesperado no sistema. Tente novamente; se continuar, abra um chamado.', ...(e.extra || {}) }));
  }
});
server.listen(process.env.PORT || 3000, () => console.log('Aventureiro ERP (demonstracao) no ar'));
