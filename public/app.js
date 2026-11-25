'use strict';
// Aventureiro ERP - versao de teste. SEM VALOR FISCAL - DEMONSTRACAO.
const S = { user: null, empresas: [], eid: 0, emp: null, perfil: '', codigo: false };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdate = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const fdt = s => s ? fdate(s) + ' ' + String(s).slice(11, 16) : '';
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const soNum = s => String(s ?? '').replace(/\D/g, '');
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fcnpj = s => { s = soNum(s); return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : s; };
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'EX'];
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };

async function api(p, o = {}) {
  const h = { 'Content-Type': 'application/json' }; if (S.eid) h['x-empresa'] = S.eid;
  let r; try { r = await fetch('/api' + p, { method: o.m || 'GET', headers: h, body: o.b ? JSON.stringify(o.b) : undefined, credentials: 'same-origin' }); }
  catch { throw Object.assign(new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.'), { status: 0 }); }
  let d = null; try { d = await r.json(); } catch { }
  if (!r.ok) { const e = new Error((d && d.erro) || 'Algo deu errado. Tente novamente.'); e.dados = d; e.status = r.status; if (r.status === 401 && S.user) { S.user = null; start(); } throw e; }
  return d;
}
function toast(m, t = '') { const e = document.createElement('div'); e.className = 'toast ' + t; e.textContent = m; $('#toasts').append(e); setTimeout(() => e.remove(), t === 'bad' ? 7000 : 3500); }
function falha(e) { toast(e.message, 'bad'); }
function listaErro(e) {
  const d = e.dados || {}; let h = `<div class="err"><b>${esc(e.message)}</b>`;
  if (d.faltas && d.faltas.length) h += '<ul>' + d.faltas.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>';
  return h + '</div>';
}
function modal({ titulo, corpo, botoes = [], fechar = true }) {
  const mb = document.createElement('div'); mb.className = 'mb';
  mb.innerHTML = `<div class="md" role="dialog"><header><h2 class="sp" style="margin:0">${esc(titulo)}</h2>${fechar ? '<button class="btn sm" data-x>✕</button>' : ''}</header><div class="bd">${corpo}</div><footer></footer></div>`;
  const ft = $('footer', mb);
  const close = () => mb.remove();
  botoes.forEach(b => { const x = document.createElement('button'); x.className = 'btn ' + (b.cls || ''); x.textContent = b.t; x.onclick = () => b.fn(close, x, mb); ft.append(x); });
  if (!botoes.length) ft.remove();
  const bx = $('[data-x]', mb); if (bx) bx.onclick = close;
  mb.addEventListener('mousedown', e => { if (e.target === mb && fechar) close(); });
  document.body.append(mb); return { close, el: mb };
}
function confirma(msg, fn, txt = 'Confirmar') { modal({ titulo: 'Confirmar', corpo: `<p>${esc(msg)}</p>`, botoes: [{ t: 'Voltar', fn: c => c() }, { t: txt, cls: 'gold', fn: c => { c(); fn(); } }] }); }
async function rodando(btn, fn) { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Aguarde…'; try { return await fn(); } finally { btn.disabled = false; btn.textContent = t; } }

// ---------- permissoes ----------
const AREAS = { Administrador: ['vendas', 'fiscal', 'financeiro', 'suporte', 'admin'], Financeiro: ['financeiro', 'suporte'], Vendedor: ['vendas', 'suporte'], Contador: [] };
const pode = a => (AREAS[S.perfil] || []).includes(a);

// ---------- cadastros ----------
const T = (k, l, extra = {}) => ({ k, l, t: 'text', ...extra });
const SEL = (k, l, o, extra = {}) => ({ k, l, t: 'select', o, ...extra });
const ENTS = {
  clientes: { t: 'Clientes e fornecedores', area: 'vendas', imp: true, cols: [['razao', 'Razão social'], ['doc', 'CNPJ/CPF', fcnpj], ['uf', 'UF'], ['papel', 'Tipo']],
    f: [SEL('papel', 'Tipo de cadastro', ['cliente', 'fornecedor', 'cliente e fornecedor']), SEL('tipo', 'Pessoa', ['PJ', 'PF']), T('doc', 'CNPJ / CPF', { cnpj: 1 }), T('razao', 'Razão social / nome', { r: 1 }), T('fantasia', 'Nome fantasia'), T('ie', 'Inscrição estadual'),
      SEL('ind_ie', 'Indicador de IE', [['1', '1 - Contribuinte'], ['2', '2 - Isento'], ['9', '9 - Não contribuinte']]), SEL('uf', 'UF', UFS, { vazio: 1 }), T('cidade', 'Cidade'), T('cep', 'CEP'), T('endereco', 'Endereço'), T('numero', 'Número'), T('bairro', 'Bairro'), T('email', 'E-mail'), T('fone', 'Telefone')] },
  produtos: { t: 'Produtos e serviços', area: 'vendas', imp: true, cols: [['sku', 'SKU'], ['descricao', 'Descrição'], ['un', 'UN'], ['preco', 'Preço', money], ['ncm', 'NCM']],
    f: [T('sku', 'SKU (automático, pode editar)', { ph: 'gerado automaticamente' }), T('descricao', 'Descrição', { r: 1 }), T('un', 'Unidade', { ph: 'UN' }), { k: 'preco', l: 'Preço de venda', t: 'number' }, { k: 'custo', l: 'Custo', t: 'number' }, T('categoria', 'Categoria'),
      T('grupo_fiscal', 'Grupo fiscal (categoria de impostos)'), { k: 'est_min', l: 'Estoque mínimo', t: 'number' }, SEL('origem', 'Origem da mercadoria', [['0', '0 - Nacional'], ['1', '1 - Estrangeira, importação direta'], ['2', '2 - Estrangeira, adquirida no mercado interno']]), T('cest', 'CEST (opcional)'), T('ncm', 'NCM', { ncm: 1 })] },
  naturezas: { t: 'Naturezas de operação', area: 'fiscal', cols: [['nome', 'Natureza'], ['cfop_interno', 'CFOP interno'], ['cfop_inter', 'CFOP interestadual'], ['validado', 'Situação', v => v ? '✔ validado' : 'PENDENTE DE VALIDAÇÃO CONTÁBIL']],
    f: [T('nome', 'Nome da natureza', { r: 1 }), T('tipo', 'Tipo/observação interna'), T('cfop_interno', 'CFOP interno (mesma UF)', { cfop: 1 }), T('cfop_inter', 'CFOP interestadual', { cfop: 1 }), T('cfop_exterior', 'CFOP exterior', { cfop: 1 }), T('cst', 'CST / CSOSN (você define)'), { k: 'obs', l: 'Observações padrão', t: 'textarea' }],
    aviso: 'O sistema não sugere CFOP nem impostos. Preencha com orientação do contador. Todo cenário nasce como PENDENTE DE VALIDAÇÃO CONTÁBIL e só é validado por Administrador ou Contador.' },
  ncm_tab: { t: 'Tabela NCM', area: 'fiscal', imp: true, cols: [['codigo', 'Código'], ['descricao', 'Descrição']], f: [T('codigo', 'Código NCM (8 dígitos)', { r: 1 }), T('descricao', 'Descrição')], aviso: 'Importe a tabela oficial (CSV ou JSON com as colunas Código e Descrição). O sistema não traz NCM inventado.' },
  cfop_tab: { t: 'Tabela CFOP', area: 'fiscal', imp: true, cols: [['codigo', 'Código'], ['descricao', 'Descrição']], f: [T('codigo', 'Código CFOP', { r: 1 }), T('descricao', 'Descrição')], aviso: 'Importe a tabela oficial de CFOP (CSV ou JSON com Código e Descrição).' },
  icms_regras: { t: 'Editor de ICMS', area: 'fiscal', cols: [['uf_origem', 'UF origem'], ['uf_destino', 'UF destino'], ['grupo_fiscal', 'Grupo fiscal'], ['aliquota', 'Alíquota %'], ['obs', 'Obs.']],
    f: [SEL('uf_origem', 'UF de origem', UFS, { r: 1 }), SEL('uf_destino', 'UF de destino', UFS, { r: 1 }), T('grupo_fiscal', 'Grupo fiscal (vazio = todos)'), { k: 'aliquota', l: 'Alíquota ICMS % (definida por você)', t: 'number' }, T('obs', 'Observação')],
    aviso: 'As alíquotas são SOMENTE as que você digitar. O sistema não sugere valores. Sem regra cadastrada, o ICMS aparece como "A VALIDAR" na nota.' },
};

function campo(f, v) {
  const id = 'f_' + f.k; v = v ?? '';
  let inp;
  if (f.t === 'select') {
    const o = (f.o || []).map(x => Array.isArray(x) ? x : [x, x]);
    inp = `<select id="${id}">${f.vazio || !o.length ? '<option value="">—</option>' : ''}${o.map(([a, b]) => `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  } else if (f.t === 'textarea') inp = `<textarea id="${id}">${esc(v)}</textarea>`;
  else inp = `<input id="${id}" type="${f.t === 'number' ? 'text' : f.t || 'text'}" ${f.t === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${f.ncm ? 'list="dl-ncm" autocomplete="off"' : ''} ${f.cfop ? 'list="dl-cfop" autocomplete="off"' : ''}>`;
  return `<div class="fld"><label for="${id}">${esc(f.l)}${f.r ? ' *' : ''}</label>${inp}</div>`;
}
function ler(fields, root) { const o = {}; fields.forEach(f => { const e = $('#f_' + f.k, root); if (e) o[f.k] = e.value; }); return o; }

// ---------- CSV ----------
function parseCSV(t) {
  t = t.replace(/^﻿/, ''); const first = t.split(/\r?\n/)[0] || ''; const d = [';', ',', '\t'].map(x => [x, first.split(x).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === d) { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch;
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r); }
  return rows.filter(x => x.some(y => String(y).trim() !== ''));
}
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function toCSV(rows, cols) { const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; return '﻿' + [cols.map(c => q(c[1])).join(';'), ...rows.map(r => cols.map(c => q(r[c[0]])).join(';'))].join('\r\n'); }
function baixa(nome, txt, tipo = 'text/csv;charset=utf-8') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: tipo })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

async function importar(nome, onFim) {
  const E = ENTS[nome]; const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.csv,.txt,.json';
  fi.onchange = async () => {
    const file = fi.files[0]; if (!file) return;
    let buf = await file.arrayBuffer(), txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    let objs = [];
    try {
      if (file.name.toLowerCase().endsWith('.json') || /^\s*[\[{]/.test(txt)) {
        let j = JSON.parse(txt); if (!Array.isArray(j)) j = Object.values(j).find(Array.isArray) || [];
        objs = j.map(o => { const r = {}; for (const [k, v] of Object.entries(o)) r[norm(k)] = v; return r; });
      } else {
        const rows = parseCSV(txt); const hd = rows[0].map(norm); objs = rows.slice(1).map(r => { const o = {}; hd.forEach((h, i) => o[h] = r[i]); return o; });
      }
    } catch { return toast('Não consegui ler o arquivo. Use CSV (separado por ; ou ,) ou JSON.', 'bad'); }
    if (!objs.length) return toast('O arquivo está vazio ou sem linhas de dados.', 'bad');
    const keys = Object.keys(objs[0]);
    const map = {}; E.f.forEach(f => { const alvo = [norm(f.k), norm(f.l)]; const alt = f.k === 'ncm_tab' ? [] : []; const h = keys.find(k => alvo.includes(k)) || (f.k === 'codigo' ? keys.find(k => ['codigo', 'cod', 'ncm', 'cfop'].includes(k)) : f.k === 'doc' ? keys.find(k => ['cnpj', 'cpf', 'cnpjcpf'].includes(k)) : f.k === 'razao' ? keys.find(k => ['razaosocial', 'nome'].includes(k)) : f.k === 'preco' ? keys.find(k => ['precodevenda', 'precovenda', 'valor'].includes(k)) : null); if (h) map[f.k] = h; });
    if (E.f.some(f => f.r && !map[f.k])) return toast(`O arquivo precisa ter a coluna "${E.f.find(f => f.r && !map[f.k]).l}". Confira o cabeçalho da primeira linha.`, 'bad');
    const linhas = objs.map(o => { const r = {}; for (const k in map) r[k] = String(o[map[k]] ?? '').trim(); if (r.codigo) r.codigo = soNum(r.codigo); return r; });
    const ignor = keys.filter(k => !Object.values(map).includes(k));
    modal({
      titulo: 'Conferência da importação', corpo: `<p><b>${linhas.length}</b> linhas encontradas em <i>${esc(file.name)}</i>.</p><p class="mut">Colunas reconhecidas: ${Object.keys(map).map(k => esc(E.f.find(f => f.k === k).l)).join(', ')}.${ignor.length ? ' Ignoradas: ' + esc(ignor.join(', ')) + '.' : ''}</p><div class="tw"><table><tr>${Object.keys(map).map(k => `<th>${esc(k)}</th>`).join('')}</tr>${linhas.slice(0, 8).map(l => `<tr>${Object.keys(map).map(k => `<td>${esc(l[k])}</td>`).join('')}</tr>`).join('')}</table></div><p class="mut">Nada é gravado até você confirmar.</p>`,
      botoes: [{ t: 'Cancelar', fn: c => c() }, { t: 'Confirmar importação', cls: 'gold', fn: async (c, b) => { await rodando(b, async () => { try { let tot = 0, er = []; for (let i = 0; i < linhas.length; i += 4000) { const r = await api(`/e/${nome}/bulk`, { m: 'POST', b: { linhas: linhas.slice(i, i + 4000) } }); tot += r.importados; er = er.concat(r.erros); } c(); toast(`${tot} linhas importadas.${er.length ? ' ' + er.length + ' com problema.' : ''}`, 'ok'); if (er.length) modal({ titulo: 'Linhas não importadas', corpo: `<ul>${er.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` }); onFim(); } catch (e) { falha(e); } }); } }]
    });
  }; fi.click();
}

// ---------- lista generica ----------
async function viewEnt(main, nome) {
  const E = ENTS[nome]; let rows = await api('/e/' + nome); let filtro = '';
  const edita = pode(E.area);
  const desenha = () => {
    const l = rows.filter(r => !filtro || JSON.stringify(Object.values(r)).toLowerCase().includes(filtro.toLowerCase())); const mostra = l.slice(0, 300);
    $('#tb', main).innerHTML = mostra.map(r => `<tr class="cl" data-id="${r.id}">${E.cols.map(c => `<td>${esc(c[2] ? c[2](r[c[0]]) : r[c[0]])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${E.cols.length}" class="mut">Nenhum registro ainda.</td></tr>`;
    $('#cnt', main).textContent = `${l.length} registro(s)${l.length > 300 ? ' (mostrando 300 — use a busca)' : ''}`;
    $$('tr.cl', main).forEach(tr => tr.onclick = () => form(rows.find(x => x.id == tr.dataset.id)));
  };
  main.innerHTML = `<div class="row"><h1 class="sp">${E.t}</h1>${edita ? '<button class="btn gold" id="novo">+ Novo</button>' : ''}${E.imp && edita ? '<button class="btn" id="imp">Importar</button>' : ''}<button class="btn" id="exp">Exportar CSV</button></div>
  ${E.aviso ? `<div class="aviso">${esc(E.aviso)}</div>` : ''}<div class="fld"><input id="busca" placeholder="Buscar…"></div><div class="tw"><table><tr>${E.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr><tbody id="tb"></tbody></table></div><p class="mut" id="cnt"></p>`;
  const recarrega = async () => { rows = await api('/e/' + nome); desenha(); };
  $('#busca', main).oninput = e => { filtro = e.target.value; desenha(); };
  $('#exp', main).onclick = () => baixa(nome + '.csv', toCSV(rows, E.f.map(f => [f.k, f.l])));
  if ($('#novo', main)) $('#novo', main).onclick = () => form(null);
  if ($('#imp', main)) $('#imp', main).onclick = () => importar(nome, recarrega);
  function form(reg) {
    const novo = !reg; reg = reg || {};
    const extra = nome === 'clientes' ? '<button class="btn sm" id="consulta" type="button">Consultar CNPJ</button>' : '';
    const m = modal({
      titulo: (novo ? 'Novo — ' : 'Editar — ') + E.t, corpo: `${E.aviso && nome === 'naturezas' ? `<div class="aviso">${esc(E.aviso)}</div>` : ''}${nome === 'naturezas' && !novo ? `<p>${reg.validado ? '<span class="tag ok">validado</span>' : '<span class="tag warn">PENDENTE DE VALIDAÇÃO CONTÁBIL</span>'}</p>` : ''}${nome === 'produtos' ? '<div id="ncmaviso"></div>' : ''}<div class="grid">${E.f.map(f => campo(f, novo && f.k === 'papel' ? 'cliente' : reg[f.k])).join('')}</div>${extra}<div id="ferr"></div>
      <datalist id="dl-ncm"></datalist><datalist id="dl-cfop"></datalist>`,
      botoes: [...(!novo && edita ? [{ t: 'Apagar', cls: 'red', fn: (c) => confirma('Apagar este registro?', async () => { try { await api(`/e/${nome}/${reg.id}`, { m: 'DELETE' }); c(); toast('Apagado.', 'ok'); recarrega(); } catch (e) { falha(e); } }, 'Apagar') }] : []),
        ...(nome === 'naturezas' && !novo && ['Administrador', 'Contador'].includes(S.perfil) ? [{ t: reg.validado ? 'Remover validação' : 'Marcar como validado', fn: async (c) => { try { await api(`/naturezas/${reg.id}/validar`, { m: 'POST', b: { validado: !reg.validado } }); c(); recarrega(); } catch (e) { falha(e); } } }] : []),
        { t: 'Fechar', fn: c => c() },
        ...(edita ? [{ t: 'Salvar', cls: 'gold', fn: async (c, b, el) => { await rodando(b, async () => { try { await api(novo ? `/e/${nome}` : `/e/${nome}/${reg.id}`, { m: novo ? 'POST' : 'PUT', b: ler(E.f, el) }); c(); toast('Salvo.', 'ok'); recarrega(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } }); } }] : [])]
    });
    if (!edita) $$('input,select,textarea', m.el).forEach(x => x.disabled = true);
    const el = m.el;
    if (nome === 'clientes') $('#consulta', el).onclick = () => consultaCnpj($('#f_doc', el).value, d => { const set = (k, v) => { if (v) $('#f_' + k, el).value = v; }; set('razao', d.razao_social); set('fantasia', d.nome_fantasia); set('uf', d.uf); set('cidade', d.municipio); set('endereco', d.logradouro); set('numero', d.numero); set('bairro', d.bairro); set('cep', d.cep); set('email', d.email); set('fone', d.ddd_telefone_1); set('tipo', 'PJ'); });
    if (nome === 'produtos') ncmBusca(el);
    if (E.f.some(f => f.cfop)) cfopBusca(el);
  }
  desenha();
}
async function consultaCnpj(doc, cb) {
  const n = soNum(doc); if (n.length !== 14) return toast('Digite um CNPJ com 14 números para consultar. Para CPF, preencha os dados à mão.', 'bad');
  try { const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + n); if (!r.ok) throw 0; const d = await r.json(); cb(d); toast('Dados preenchidos pela consulta pública. Confira antes de salvar.', 'ok'); }
  catch { toast('Não consegui consultar o CNPJ agora (serviço público indisponível ou CNPJ não encontrado). Preencha os dados manualmente.', 'bad'); }
}
function ncmBusca(el) {
  const i = $('#f_ncm', el), dl = $('#dl-ncm', el); let t;
  i.oninput = () => { clearTimeout(t); t = setTimeout(async () => { if (i.value.length < 2) return; try { const r = await api('/ncm/buscar?q=' + encodeURIComponent(i.value)); $('#ncmaviso', el).innerHTML = r.tabela_vazia ? '<div class="aviso">A tabela NCM ainda não foi importada (menu Fiscal › Tabela NCM). Você pode digitar o NCM manualmente.</div>' : ''; dl.innerHTML = (r.itens || []).map(x => `<option value="${esc(x.codigo)}">${esc(x.descricao)}</option>`).join(''); } catch { } }, 250); };
}
function cfopBusca(el) {
  const dl = $('#dl-cfop', el); api('/e/cfop_tab?limite=2000').then(r => { dl.innerHTML = r.map(x => `<option value="${esc(x.codigo)}">${esc(x.descricao)}</option>`).join(''); }).catch(() => { });
}

// ---------- documentos ----------
const DOCS = { orc: { t: 'Orçamentos', um: 'Orçamento', st: { rascunho: ['Rascunho', ''], aprovado: ['Aprovado', 'ok'], cancelada: ['Cancelado', 'bad'] } }, ped: { t: 'Pedidos', um: 'Pedido', st: { aberto: ['Aberto', 'warn'], faturando: ['Nota em preparo', 'gold'], faturado: ['Faturado', 'ok'], cancelada: ['Cancelado', 'bad'] } }, nfe: { t: 'Notas fiscais (demonstração)', um: 'NF-e', st: { previa: ['Prévia', 'warn'], emitida: ['Emitida (demo)', 'ok'], cancelada: ['Cancelada', 'bad'] } } };
async function viewDocs(main, kind) {
  const D = DOCS[kind]; const rows = await api('/docs?kind=' + kind);
  main.innerHTML = `<div class="row"><h1 class="sp">${D.t}</h1>${pode('vendas') ? `<button class="btn gold" id="novo">+ ${kind === 'nfe' ? 'Nova prévia de NF-e' : 'Novo ' + D.um.toLowerCase()}</button>` : ''}</div>
  ${kind === 'nfe' ? '<div class="aviso">Notas de demonstração: <b>SEM VALOR FISCAL</b>. Não são enviadas à SEFAZ.</div>' : ''}
  <div class="tw"><table><tr><th>Nº</th><th>Cliente</th><th>Data</th><th class="r">Total</th><th>Situação</th></tr>${rows.map(r => { const s = D.st[r.status] || [r.status, '']; return `<tr class="cl" data-id="${r.id}"><td>${kind === 'nfe' && r.nfe_numero ? r.nfe_numero : r.numero}</td><td>${esc(r.cliente || '—')}</td><td>${fdate(r.data)}</td><td class="r">${money(r.total)}</td><td><span class="tag ${s[1]}">${esc(s[0])}</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="mut">Nada por aqui ainda.</td></tr>'}</table></div>`;
  if ($('#novo', main)) $('#novo', main).onclick = () => { location.hash = '#/novo/' + kind; };
  $$('tr.cl', main).forEach(tr => tr.onclick = () => location.hash = '#/doc/' + tr.dataset.id);
}
async function viewDoc(main, kind, id) {
  const [clientes, nats, prods] = await Promise.all([api('/e/clientes'), api('/e/naturezas'), api('/e/produtos')]);
  let d = id ? await api('/docs/' + id) : { kind, status: kind === 'orc' ? 'rascunho' : kind === 'ped' ? 'aberto' : 'previa', itens: [], frete: {}, pagamento: { parcelas: 1, primeiro_venc: somaDias(hoje(), 30) }, data: hoje(), obs: '' };
  kind = d.kind; const D = DOCS[kind];
  const trava = ['emitida', 'cancelada'].includes(d.status) || !pode('vendas');
  let it = (d.itens || []).map(x => ({ ...x })); if (!it.length) it.push({ descricao: '', qtd: 1, preco: '' });
  const st = D.st[d.status] || [d.status, ''];
  const opt = (arr, v, lab) => arr.map(x => `<option value="${x.id}" ${x.id == v ? 'selected' : ''}>${esc(lab(x))}</option>`).join('');
  main.innerHTML = `<div class="row"><h1 class="sp">${D.um}${d.id ? ' nº ' + (d.nfe_numero || d.numero) : ' — novo'} <span class="tag ${st[1]}">${esc(st[0])}</span></h1><a class="btn sm" href="#/${kind}">← Voltar</a></div>
  ${kind === 'nfe' ? '<div class="demo">SEM VALOR FISCAL - DEMONSTRAÇÃO. Esta nota não é válida e não vai à SEFAZ.</div>' : ''}
  <div id="msg"></div>
  <div class="card"><div class="grid"><div class="fld"><label>Cliente (destinatário)</label><select id="cli" ${trava ? 'disabled' : ''}><option value="">— escolha —</option>${opt(clientes, d.cliente_id, c => `${c.razao} ${c.doc ? '(' + fcnpj(c.doc) + ')' : ''}`)}</select></div>
  <div class="fld"><label>Data</label><input id="data" type="date" value="${esc(d.data)}" ${trava ? 'disabled' : ''}></div>
  ${kind === 'nfe' ? `<div class="fld"><label>Natureza da operação</label><select id="nat" ${trava ? 'disabled' : ''}><option value="">— escolha —</option>${opt(nats, d.natureza_id, n => n.nome + (n.validado ? '' : ' (pendente)'))}</select></div>` : `<div class="fld"><label>Natureza da operação</label><select id="nat" ${trava ? 'disabled' : ''}><option value="">— opcional —</option>${opt(nats, d.natureza_id, n => n.nome)}</select></div>`}</div>
  ${clientes.length ? '' : '<div class="aviso">Você ainda não tem clientes. Cadastre em <a href="#/clientes">Clientes</a> ou use os dados de exemplo no Painel.</div>'}
  ${kind === 'nfe' && d.cfop !== undefined ? `<p class="mut">CFOP aplicado: <b>${esc(d.cfop || 'A VALIDAR')}</b> ${d.cliente && S.emp.uf ? (d.cliente.uf === S.emp.uf ? '(operação interna)' : '(operação interestadual)') : ''}</p>` : ''}</div>
  <h3 style="margin-top:1rem">Produtos</h3><div class="card"><div class="itens" id="itens"></div>${trava ? '' : '<button class="btn sm" id="add">+ Adicionar item</button>'}<datalist id="dlp">${prods.map(p => `<option value="${esc(p.sku + ' — ' + p.descricao)}"></option>`).join('')}</datalist>
  ${prods.length ? '' : '<div class="aviso">Nenhum produto cadastrado. Cadastre em <a href="#/produtos">Produtos</a>.</div>'}</div>
  <div class="totais"><span class="mut">Itens: <b id="tIt">0</b></span>${kind === 'nfe' ? '<span class="mut">Frete: <b id="tFr">R$ 0,00</b></span>' : ''}<span>Total: <b class="kpi" id="tTot">R$ 0,00</b></span></div>
  ${kind === 'nfe' || kind === 'ped' ? `<h3>Transporte (dentro da nota)</h3><div class="card"><div class="grid g2">
   <div class="fld"><label>Frete por conta de</label><select id="fr_mod" ${trava ? 'disabled' : ''}>${[['9', '9 - Sem frete'], ['0', '0 - Emitente'], ['1', '1 - Destinatário'], ['2', '2 - Terceiros']].map(([a, b]) => `<option value="${a}" ${(d.frete.modalidade || '9') == a ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
   <div class="fld"><label>Transportadora</label><input id="fr_tr" value="${esc(d.frete.transportadora)}" ${trava ? 'disabled' : ''}></div><div class="fld"><label>Placa</label><input id="fr_pl" value="${esc(d.frete.placa)}" ${trava ? 'disabled' : ''}></div>
   <div class="fld"><label>Volumes</label><input id="fr_vo" value="${esc(d.frete.volumes)}" ${trava ? 'disabled' : ''}></div><div class="fld"><label>Peso bruto (kg)</label><input id="fr_pb" value="${esc(d.frete.peso_b)}" ${trava ? 'disabled' : ''}></div><div class="fld"><label>Peso líquido (kg)</label><input id="fr_pn" value="${esc(d.frete.peso_l)}" ${trava ? 'disabled' : ''}></div>
   ${kind === 'nfe' ? `<div class="fld"><label>Valor do frete (R$)</label><input id="fr_vf" inputmode="decimal" value="${esc(d.frete.valor_frete)}" ${trava ? 'disabled' : ''}></div>` : ''}</div></div>` : ''}
  <h3 style="margin-top:1rem">Pagamento</h3><div class="card"><div class="grid g2"><div class="fld"><label>Forma de pagamento</label><select id="pg_f" ${trava ? 'disabled' : ''}><option value="">— escolha —</option>${['Dinheiro', 'PIX', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Transferência'].map(x => `<option ${d.pagamento.forma === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
  <div class="fld"><label>Parcelas</label><input id="pg_p" inputmode="numeric" value="${esc(d.pagamento.parcelas || 1)}" ${trava ? 'disabled' : ''}></div><div class="fld"><label>1º vencimento</label><input id="pg_v" type="date" value="${esc(d.pagamento.primeiro_venc || '')}" ${trava ? 'disabled' : ''}></div></div></div>
  <div class="fld" style="margin-top:1rem"><label>Informações adicionais / observações</label><textarea id="obs" ${trava ? 'disabled' : ''}>${esc(d.obs)}</textarea></div>
  <div id="faltas"></div><div class="row" id="acoes" style="margin-top:.8rem"></div>`;
  // itens
  const itensEl = $('#itens', main);
  function totais() { let t = 0; it.forEach(x => t += num(x.qtd) * num(x.preco)); $('#tIt', main).textContent = money(t); const fr = $('#fr_vf', main) ? num($('#fr_vf', main).value) : 0; if ($('#tFr', main)) $('#tFr', main).textContent = money(fr); $('#tTot', main).textContent = money(t + (kind === 'nfe' ? fr : 0)); }
  function desItens() {
    itensEl.innerHTML = it.map((x, n) => `<div class="it" data-n="${n}"><div class="pd"><input class="ip" list="dlp" placeholder="Buscar produto por código ou nome" value="${esc(x.produto_id || x.sku ? (x.sku ? x.sku + ' — ' : '') + x.descricao : x.descricao)}" ${trava ? 'disabled' : ''}></div><input class="iq" inputmode="decimal" value="${esc(x.qtd)}" title="Quantidade" ${trava ? 'disabled' : ''}><input class="ipr" inputmode="decimal" value="${esc(x.preco)}" placeholder="Preço" title="Preço unitário" ${trava ? 'disabled' : ''}><div class="r mut sub">${money(num(x.qtd) * num(x.preco))}</div>${trava ? '<span></span>' : '<button class="btn sm red ir" title="Remover">✕</button>'}</div>`).join(''); totais();
  }
  itensEl.addEventListener('input', e => { const r = e.target.closest('.it'); if (!r) return; const x = it[+r.dataset.n];
    if (e.target.classList.contains('ip')) { const p = prods.find(p => (p.sku + ' — ' + p.descricao) === e.target.value); if (p) { Object.assign(x, { produto_id: p.id, sku: p.sku, descricao: p.descricao, un: p.un, ncm: p.ncm, preco: p.preco ?? '' }); desItens(); } else { x.produto_id = null; x.descricao = e.target.value; } }
    if (e.target.classList.contains('iq')) x.qtd = e.target.value; if (e.target.classList.contains('ipr')) x.preco = e.target.value;
    const sub = $('.sub', r); if (sub) sub.textContent = money(num(x.qtd) * num(x.preco)); totais(); });
  itensEl.addEventListener('click', e => { if (e.target.classList.contains('ir')) { it.splice(+e.target.closest('.it').dataset.n, 1); if (!it.length) it.push({ descricao: '', qtd: 1, preco: '' }); desItens(); } });
  if ($('#add', main)) $('#add', main).onclick = () => { it.push({ descricao: '', qtd: 1, preco: '' }); desItens(); };
  if ($('#fr_vf', main)) $('#fr_vf', main).oninput = totais;
  desItens();
  const coleta = () => ({ kind, cliente_id: $('#cli', main).value || null, natureza_id: $('#nat', main).value || null, data: $('#data', main).value, obs: $('#obs', main).value, itens: it, origem_id: d.origem_id,
    frete: $('#fr_mod', main) ? { modalidade: $('#fr_mod', main).value, transportadora: $('#fr_tr', main).value, placa: $('#fr_pl', main).value, volumes: $('#fr_vo', main).value, peso_b: $('#fr_pb', main).value, peso_l: $('#fr_pn', main).value, valor_frete: $('#fr_vf', main) ? $('#fr_vf', main).value : '' } : {},
    pagamento: { forma: $('#pg_f', main).value, parcelas: $('#pg_p', main).value, primeiro_venc: $('#pg_v', main).value } });
  const salvar = async () => { const r = await api(id ? '/docs/' + id : '/docs', { m: id ? 'PUT' : 'POST', b: coleta() }); return r.id; };
  const recarrega = (novoId) => { if (novoId && novoId != id) location.hash = '#/doc/' + novoId; else route(); };
  const A = $('#acoes', main); const add = (t, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t; b.onclick = () => rodando(b, async () => { $('#msg', main).innerHTML = ''; try { await fn(); } catch (e) { $('#msg', main).innerHTML = listaErro(e); scrollTo(0, 0); } }); A.append(b); };
  const faltasBox = () => { if (kind === 'nfe' && d.id && d.status === 'previa') { const f = d.faltas || [], a = d.avisos || []; $('#faltas', main).innerHTML = (f.length ? `<div class="err"><b>O que falta para emitir:</b><ul>${f.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="aviso" style="border-color:#1f5c42;color:#9be0bf;background:#0e1f18">Tudo preenchido. Pode emitir a nota de demonstração.</div>') + (a.length ? `<div class="aviso"><b>Atenção (não bloqueia):</b><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''); } };
  faltasBox();
  if (!trava) add('Salvar', 'gold', async () => { const n = await salvar(); toast('Salvo.', 'ok'); recarrega(n); });
  if (d.id && !trava) {
    if (kind === 'orc') add('Aprovar e gerar pedido', '', async () => { await salvar(); const r = await api(`/docs/${id}/converter`, { m: 'POST' }); toast('Pedido criado.', 'ok'); location.hash = '#/doc/' + r.id; });
    if (kind === 'ped') add('Gerar prévia da NF-e', '', async () => { await salvar(); const r = await api(`/docs/${id}/converter`, { m: 'POST' }); toast('Prévia criada.', 'ok'); location.hash = '#/doc/' + r.id; });
    if (kind === 'nfe') add('Emitir nota de demonstração', 'gold', async () => { await salvar(); try { await api(`/docs/${id}/emitir`, { m: 'POST' }); toast('Nota de demonstração emitida. Financeiro e estoque atualizados.', 'ok'); route(); } catch (e) { const dd = await api('/docs/' + id); d = dd; faltasBox(); throw e; } });
    add('Apagar', 'red', async () => { await new Promise(ok => confirma('Apagar este documento?', ok, 'Apagar')); await api('/docs/' + id, { m: 'DELETE' }); toast('Apagado.', 'ok'); location.hash = '#/' + kind; });
  }
  if (kind === 'nfe' && d.status === 'emitida') {
    add('Ver DANFE / PDF', 'gold', async () => { location.hash = '#/danfe/' + id; });
    const a = document.createElement('a'); a.className = 'btn'; a.textContent = 'Baixar XML'; a.href = `/api/docs/${id}/xml?e=${S.eid}`; A.append(a);
    if (pode('vendas')) add('Cancelar nota (demo)', 'red', async () => { await new Promise(ok => confirma('Cancelar esta nota? O estoque volta e as contas a receber abertas são canceladas.', ok)); await api(`/docs/${id}/cancelar`, { m: 'POST' }); toast('Cancelada.', 'ok'); route(); });
  }
  if (d.origem_id) { const a = document.createElement('a'); a.className = 'btn'; a.href = '#/doc/' + d.origem_id; a.textContent = 'Ver documento de origem'; A.append(a); }
}
async function viewDanfe(main, id) {
  const d = await api('/docs/' + id), e = d.empresa, c = d.cliente || {}, n = d.natureza || {}, fr = d.frete || {}, pg = d.pagamento || {}; if (d.kind !== 'nfe') return main.innerHTML = '<p>Só notas têm DANFE.</p>';
  const emit = d.status === 'emitida'; const prod = d.itens.reduce((s, i) => s + i.subtotal, 0), vf = num(fr.valor_frete);
  const parc = Math.max(1, parseInt(pg.parcelas) || 1); const dup = []; for (let p = 0; p < parc; p++) { const dt = new Date((pg.primeiro_venc || hoje()) + 'T12:00:00Z'); dt.setUTCMonth(dt.getUTCMonth() + p); dup.push(`<span class="bx" style="display:inline-block">${p + 1}/${parc} — ${fdate(dt.toISOString().slice(0, 10))} — ${money(d.total / parc)}</span>`); }
  const B = (l, v, w = '') => `<div class="bx" style="${w ? 'width:' + w : 'flex:1'}"><small>${l}</small><b>${esc(v) || '&nbsp;'}</b></div>`;
  main.innerHTML = `<div class="row hide-print"><a class="btn sm" href="#/doc/${id}">← Voltar</a><span class="sp"></span><button class="btn gold" id="pr">Imprimir / Salvar como PDF</button></div>
  <p class="mut hide-print">Dica: na janela de impressão escolha “Salvar como PDF”. O documento é uma DEMONSTRAÇÃO sem valor fiscal.</p>
  <div class="danfe"><div class="wm">SEM VALOR FISCAL<br>DEMONSTRAÇÃO</div><div class="faixa">SEM VALOR FISCAL - DEMONSTRAÇÃO${emit ? '' : ' — PRÉVIA (NÃO EMITIDA)'}</div>
  <div class="gr"><div class="bx" style="flex:2"><small>Emitente</small><b style="font-size:13px">${esc(e.razao)}</b><br>${esc(e.endereco)} ${esc(e.numero)} ${esc(e.bairro)} — ${esc(e.cidade)}/${esc(e.uf)}<br>CNPJ ${fcnpj(e.cnpj) || 'A VALIDAR'}</div>
  <div class="bx" style="flex:1.2;text-align:center"><b style="font-size:13px">DANFE</b><br>Documento Auxiliar da NF-e<br><b>(DEMONSTRAÇÃO)</b><br>1 - SAÍDA<br><b>Nº ${emit ? d.nfe_numero : '—'} &nbsp; Série ${esc(e.serie)}</b></div>
  <div class="bx" style="flex:1.6"><small>Chave de acesso</small><b>NAO GERADA - DEMONSTRACAO</b><br><small>Protocolo de autorização</small><b>SEM PROTOCOLO - DEMONSTRAÇÃO</b></div></div>
  <div class="gr">${B('Natureza da operação', n.nome, '60%')}${B('CFOP', d.cfop || 'A VALIDAR')}${B('Inscrição estadual', e.ie || 'A VALIDAR')}${B('Regime', e.regime)}</div>
  <div class="tt">DESTINATÁRIO / REMETENTE</div><div class="gr">${B('Nome / razão social', c.razao, '60%')}${B('CNPJ / CPF', fcnpj(c.doc))}${B('Data de emissão', fdate(d.data))}</div>
  <div class="gr">${B('Endereço', [c.endereco, c.numero, c.bairro].filter(Boolean).join(', '), '50%')}${B('Município', c.cidade)}${B('UF', c.uf)}${B('Insc. estadual', c.ie)}</div>
  <div class="tt">FATURA / DUPLICATAS</div><div style="padding:3px">${dup.join(' ')} <span class="mut">(${esc(pg.forma || 'forma a definir')})</span></div>
  <div class="tt">CÁLCULO DO IMPOSTO</div><div class="gr">${B('Base cálc. ICMS', 'A VALIDAR')}${B('Valor ICMS', 'A VALIDAR')}${B('Valor dos produtos', money(prod))}${B('Valor do frete', money(vf))}${B('Valor total da nota', money(d.total))}</div>
  <div class="tt">TRANSPORTADOR / VOLUMES</div><div class="gr">${B('Transportadora', fr.transportadora, '35%')}${B('Frete por conta', { 0: '0-Emitente', 1: '1-Destinatário', 2: '2-Terceiros', 9: '9-Sem frete' }[fr.modalidade || 9])}${B('Placa', fr.placa)}${B('Volumes', fr.volumes)}${B('Peso bruto', fr.peso_b)}${B('Peso líquido', fr.peso_l)}</div>
  <div class="tt">DADOS DOS PRODUTOS / SERVIÇOS</div><table><tr><th>Cód.</th><th>Descrição</th><th>NCM</th><th>CST</th><th>CFOP</th><th>UN</th><th>Qtd</th><th>V. unit.</th><th>V. total</th></tr>${d.itens.map(i => `<tr><td>${esc(i.sku)}</td><td>${esc(i.descricao)}</td><td>${esc(i.ncm || 'A VALIDAR')}</td><td>${esc(n.cst || 'A VALIDAR')}</td><td>${esc(d.cfop || 'A VALIDAR')}</td><td>${esc(i.un)}</td><td>${i.qtd}</td><td>${money(i.preco)}</td><td>${money(i.subtotal)}</td></tr>`).join('')}</table>
  <div class="tt">DADOS ADICIONAIS</div><div class="bx" style="min-height:50px">SEM VALOR FISCAL - DEMONSTRAÇÃO. ${esc(d.obs)}</div></div>`;
  $('#pr', main).onclick = () => window.print();
}

// ---------- telas ----------
async function viewPainel(main) {
  const p = await api('/painel');
  main.innerHTML = `<h1>Painel</h1>${p.bloqueio ? `<div class="err"><b>${esc(p.bloqueio)}</b></div>` : ''}
  <div class="grid g2"><div class="card"><div class="kpil">Vendas do mês (pedidos)</div><div class="kpi">${money(p.vendas_mes)}</div></div><div class="card"><div class="kpil">Notas de demo emitidas no mês</div><div class="kpi">${p.notas_mes}</div></div>
  <div class="card"><div class="kpil">A receber</div><div class="kpi">${money(p.receber)}</div></div><div class="card"><div class="kpil">A pagar</div><div class="kpi">${money(p.pagar)}</div></div>
  <div class="card"><div class="kpil">Contas atrasadas</div><div class="kpi ${p.atrasadas ? 'bad' : ''}">${p.atrasadas}</div></div><div class="card"><div class="kpil">Estoque baixo</div><div class="kpi ${p.estoque_baixo ? 'warn' : ''}">${p.estoque_baixo}</div></div></div>
  ${!p.tab_ncm || !p.tab_cfop ? `<div class="aviso">Tabelas fiscais ainda vazias: ${!p.tab_ncm ? 'NCM ' : ''}${!p.tab_cfop ? 'CFOP ' : ''}— importe em <a href="#/ncm_tab">Fiscal</a>. O sistema não inventa dados fiscais.</div>` : ''}
  ${pode('admin') ? '<p><button class="btn" id="ex">Criar dados de exemplo (fictícios)</button></p>' : ''}
  <h3 style="margin-top:1rem">Últimas atividades</h3><div class="tw"><table>${p.atividades.map(a => `<tr><td>${fdt(a.quando)}</td><td>${esc(a.usuario)}</td><td>${esc(a.acao)} <span class="mut">${esc(a.detalhe)}</span></td></tr>`).join('') || '<tr><td class="mut">Sem atividades.</td></tr>'}</table></div>`;
  if ($('#ex', main)) $('#ex', main).onclick = async () => { try { await api('/exemplo', { m: 'POST' }); toast('Exemplo fictício criado (1 cliente e 1 produto).', 'ok'); route(); } catch (e) { falha(e); } };
}
async function viewFin(main, aba = 'receber') {
  const rows = await api('/e/financeiro'); const rel = await api('/relatorios');
  const tabs = `<div class="tabs">${[['receber', 'A receber'], ['pagar', 'A pagar'], ['fluxo', 'Fluxo de caixa']].map(([k, l]) => `<a href="#/financeiro/${k}" class="${k === aba ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  if (aba === 'fluxo') {
    const m = {}; rel.fluxo.forEach(x => { const o = m[x.mes] = m[x.mes] || { rec: 0, pag: 0, arec: 0, apag: 0 }; if (x.tipo === 'receber') { x.status === 'pago' ? o.rec += x.total : o.arec += x.total; } else { x.status === 'pago' ? o.pag += x.total : o.apag += x.total; } });
    main.innerHTML = `<h1>Financeiro</h1>${tabs}<div class="tw"><table><tr><th>Mês</th><th class="r">Recebido</th><th class="r">Pago</th><th class="r">Saldo realizado</th><th class="r">A receber</th><th class="r">A pagar</th><th class="r">Saldo previsto</th></tr>${Object.keys(m).sort().map(k => { const o = m[k]; return `<tr><td>${k.split('-').reverse().join('/')}</td><td class="r">${money(o.rec)}</td><td class="r">${money(o.pag)}</td><td class="r"><b>${money(o.rec - o.pag)}</b></td><td class="r">${money(o.arec)}</td><td class="r">${money(o.apag)}</td><td class="r"><b>${money(o.rec - o.pag + o.arec - o.apag)}</b></td></tr>`; }).join('') || '<tr><td colspan="7" class="mut">Sem movimentos.</td></tr>'}</table></div>`; return;
  }
  let fs = 'todos', de = '', ate = '';
  main.innerHTML = `<div class="row"><h1 class="sp">Financeiro</h1>${pode('financeiro') ? '<button class="btn gold" id="novo">+ Novo lançamento</button>' : ''}</div>${tabs}
  <div class="grid g2"><div class="fld"><label>Situação</label><select id="fs"><option value="todos">Todas</option><option value="aberto">Em aberto</option><option value="pago">Pagas</option><option value="cancelado">Canceladas</option></select></div><div class="fld"><label>Vencimento de</label><input type="date" id="de"></div><div class="fld"><label>até</label><input type="date" id="ate"></div></div>
  <div class="tw"><table><tr><th>Venc.</th><th>Descrição</th><th>${aba === 'receber' ? 'Cliente' : 'Fornecedor'}</th><th class="r">Valor</th><th>Situação</th><th></th></tr><tbody id="tb"></tbody></table></div><p class="mut" id="tot"></p>`;
  const des = () => { const l = rows.filter(r => r.tipo === aba && (fs === 'todos' || r.status === fs) && (!de || r.venc >= de) && (!ate || r.venc <= ate)).sort((a, b) => a.venc < b.venc ? -1 : 1);
    $('#tb', main).innerHTML = l.map(r => { const atr = r.status === 'aberto' && r.venc < hoje(); return `<tr><td>${fdate(r.venc)}</td><td>${esc(r.descricao)}</td><td>${esc(r.parceiro)}</td><td class="r">${money(r.valor)}</td><td><span class="tag ${r.status === 'pago' ? 'ok' : atr ? 'bad' : r.status === 'cancelado' ? '' : 'warn'}">${r.status === 'pago' ? 'Pago em ' + fdate(r.pago_em) : atr ? 'Atrasado' : r.status === 'cancelado' ? 'Cancelado' : 'Em aberto'}</span></td><td class="r">${pode('financeiro') ? (r.status === 'aberto' ? `<button class="btn sm gold" data-b="${r.id}">${aba === 'receber' ? 'Receber' : 'Pagar'}</button>` : r.status === 'pago' ? `<button class="btn sm" data-e="${r.id}">Estornar</button>` : '') : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="mut">Nada neste filtro.</td></tr>';
    $('#tot', main).textContent = 'Total listado: ' + money(l.reduce((s, r) => s + r.valor, 0));
    $$('[data-b]', main).forEach(b => b.onclick = () => confirma('Confirmar a baixa (pagamento) deste lançamento hoje?', async () => { try { await api(`/financeiro/${b.dataset.b}/baixar`, { m: 'POST', b: {} }); toast('Baixa feita.', 'ok'); route(); } catch (e) { falha(e); } }));
    $$('[data-e]', main).forEach(b => b.onclick = () => confirma('Estornar esta baixa?', async () => { try { await api(`/financeiro/${b.dataset.e}/estornar`, { m: 'POST', b: {} }); route(); } catch (e) { falha(e); } }));
  };
  $('#fs', main).onchange = e => { fs = e.target.value; des(); }; $('#de', main).onchange = e => { de = e.target.value; des(); }; $('#ate', main).onchange = e => { ate = e.target.value; des(); }; des();
  if ($('#novo', main)) $('#novo', main).onclick = () => { const F = [T('descricao', 'Descrição', { r: 1 }), T('parceiro', aba === 'receber' ? 'Cliente' : 'Fornecedor'), { k: 'valor', l: 'Valor (R$)', t: 'number', r: 1 }, { k: 'venc', l: 'Vencimento', t: 'date', r: 1 }];
    modal({ titulo: 'Novo lançamento — ' + (aba === 'receber' ? 'a receber' : 'a pagar'), corpo: `<div class="grid">${F.map(f => campo(f, f.k === 'venc' ? hoje() : '')).join('')}</div><div id="ferr"></div>`, botoes: [{ t: 'Cancelar', fn: c => c() }, { t: 'Salvar', cls: 'gold', fn: async (c, b, el) => { await rodando(b, async () => { try { await api('/e/financeiro', { m: 'POST', b: { ...ler(F, el), tipo: aba } }); c(); toast('Lançado.', 'ok'); route(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } }); } }] }); };
}
async function viewEstoque(main) {
  const [sal, mov, clientes] = await Promise.all([api('/estoque'), api('/estoque/mov'), api('/e/clientes')]);
  main.innerHTML = `<div class="row"><h1 class="sp">Compras e estoque</h1>${pode('financeiro') ? '<button class="btn gold" id="cp">+ Registrar compra</button>' : ''}${pode('vendas') ? '<button class="btn" id="aj">Ajuste de estoque</button>' : ''}</div>
  <div class="tw"><table><tr><th>SKU</th><th>Produto</th><th class="r">Saldo</th><th class="r">Mínimo</th><th></th></tr>${sal.map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.descricao)}</td><td class="r">${p.saldo}</td><td class="r">${p.est_min || '—'}</td><td>${p.est_min > 0 && p.saldo <= p.est_min ? '<span class="tag bad">estoque baixo</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">Cadastre produtos para controlar o estoque.</td></tr>'}</table></div>
  <h3 style="margin-top:1rem">Histórico de movimentações</h3><div class="tw"><table><tr><th>Data</th><th>Produto</th><th>Movimento</th><th class="r">Qtd</th></tr>${mov.map(m => `<tr><td>${fdate(m.data)}</td><td>${esc(m.sku)} ${esc(m.descricao)}</td><td>${esc(m.motivo)}</td><td class="r ${m.qtd < 0 ? 'bad' : 'ok'}">${m.qtd > 0 ? '+' : ''}${m.qtd}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">Sem movimentos.</td></tr>'}</table></div>`;
  const sel = `<select class="cp">${sal.map(p => `<option value="${p.id}">${esc(p.sku + ' — ' + p.descricao)}</option>`).join('')}</select>`;
  if ($('#cp', main)) $('#cp', main).onclick = () => { if (!sal.length) return toast('Cadastre um produto antes de registrar compras.', 'bad');
    const m = modal({ titulo: 'Registrar compra (entrada de estoque)', corpo: `<div class="grid"><div class="fld"><label>Fornecedor</label><input id="forn" list="dlf" placeholder="Nome do fornecedor"><datalist id="dlf">${clientes.filter(c => c.papel !== 'cliente').map(c => `<option value="${esc(c.razao)}">`).join('')}</datalist></div><div class="fld"><label>Vencimento do pagamento</label><input id="venc" type="date" value="${somaDias(hoje(), 30)}"></div></div><div id="lin"></div><button class="btn sm" id="mais">+ item</button><div id="ferr"></div>`,
      botoes: [{ t: 'Cancelar', fn: c => c() }, { t: 'Registrar', cls: 'gold', fn: async (c, b, el) => { await rodando(b, async () => { try { const itens = $$('.lin', el).map(l => ({ produto_id: $('select', l).value, qtd: $('.q', l).value, custo: $('.c', l).value })); const r = await api('/compras', { m: 'POST', b: { fornecedor: $('#forn', el).value, venc: $('#venc', el).value, itens } }); c(); toast('Compra registrada. Estoque atualizado' + (r.total ? ' e conta a pagar criada.' : '.'), 'ok'); route(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } }); } }] });
    const addl = () => { const d = document.createElement('div'); d.className = 'row lin'; d.style.marginBottom = '.4rem'; d.innerHTML = `<div class="sp" style="min-width:180px">${sel}</div><input class="q" style="width:80px" placeholder="Qtd" inputmode="decimal"><input class="c" style="width:100px" placeholder="Custo un." inputmode="decimal">`; $('#lin', m.el).append(d); }; addl(); $('#mais', m.el).onclick = addl; };
  if ($('#aj', main)) $('#aj', main).onclick = () => { if (!sal.length) return toast('Cadastre um produto antes.', 'bad');
    modal({ titulo: 'Ajuste de estoque', corpo: `<div class="fld"><label>Produto</label>${sel.replace('class="cp"', 'id="ap"')}</div><div class="fld"><label>Quantidade (use - para saída)</label><input id="aq" inputmode="decimal"></div><div class="fld"><label>Motivo</label><input id="am"></div><div id="ferr"></div>`, botoes: [{ t: 'Cancelar', fn: c => c() }, { t: 'Salvar', cls: 'gold', fn: async (c, b, el) => { try { await api('/estoque/ajuste', { m: 'POST', b: { produto_id: $('#ap', el).value, qtd: $('#aq', el).value, motivo: $('#am', el).value } }); c(); route(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } } }] }); };
}
async function viewRel(main) {
  const r = await api('/relatorios'); const tb = (h, rows) => `<div class="tw"><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows || `<tr><td colspan="${h.length}" class="mut">Sem dados.</td></tr>`}</table></div>`;
  main.innerHTML = `<h1>Relatórios</h1><h3>Vendas por mês (pedidos)</h3>${tb(['Mês', 'Pedidos', 'Total'], r.vendas_mes.map(x => `<tr><td>${x.mes.split('-').reverse().join('/')}</td><td>${x.pedidos}</td><td>${money(x.total)}</td></tr>`).join(''))}
  <h3 style="margin-top:1rem">Produtos mais vendidos (notas emitidas)</h3>${tb(['Produto', 'Qtd', 'Total'], r.top_produtos.map(x => `<tr><td>${esc(x.produto)}</td><td>${x.qtd}</td><td>${money(x.total)}</td></tr>`).join(''))}
  <h3 style="margin-top:1rem">Financeiro por situação</h3>${tb(['Tipo', 'Situação', 'Qtde', 'Total'], r.financeiro.map(x => `<tr><td>${esc(x.tipo)}</td><td>${esc(x.status)}</td><td>${x.n}</td><td>${money(x.total)}</td></tr>`).join(''))}
  <h3 style="margin-top:1rem">Estoque abaixo do mínimo</h3>${tb(['SKU', 'Produto', 'Saldo', 'Mínimo'], r.estoque_baixo.map(x => `<tr><td>${esc(x.sku)}</td><td>${esc(x.descricao)}</td><td>${x.saldo}</td><td>${x.est_min}</td></tr>`).join(''))}`;
}
async function viewAssin(main) {
  const e = await api('/empresa'); const adm = pode('admin');
  const nomes = { teste: 'Teste grátis de 7 dias', ativo: 'Ativo', inadimplente: 'Inadimplente', cancelado: 'Cancelado' };
  main.innerHTML = `<h1>Assinatura</h1><div class="demo">SIMULADO — nenhuma cobrança real é feita.</div>
  <div class="card gold"><div class="kpil">Situação da empresa</div><div class="kpi">${nomes[e.status_assin]}${e.status_assin === 'ativo' ? ' — plano ' + esc(e.plano) : ''}</div>${e.status_assin === 'teste' ? `<p class="mut">Teste vai até ${fdate(e.trial_fim)}.</p>` : ''}${e.bloqueio ? `<div class="err">${esc(e.bloqueio)}</div>` : '<p class="ok">Emissão liberada.</p>'}</div>
  <h3 style="margin-top:1rem">Planos (valores a definir)</h3><div class="grid">${['mensal', 'semestral', 'anual'].map(p => `<div class="card"><h2>${p[0].toUpperCase() + p.slice(1)}</h2><p class="mut">Preço a definir pelos sócios.</p>${adm ? `<button class="btn gold" data-p="${p}">Assinar (simulado)</button>` : ''}</div>`).join('')}</div>
  ${adm ? '<h3 style="margin-top:1rem">Simulações</h3><div class="row"><button class="btn" data-a="inadimplir">Simular inadimplência</button><button class="btn" data-a="cancelar">Simular cancelamento</button><button class="btn" data-a="teste">Reiniciar teste de 7 dias</button></div>' : '<p class="mut">Apenas Administrador altera a assinatura.</p>'}`;
  const go = async b => { try { await api('/assinatura', { m: 'POST', b }); toast('Atualizado (simulado).', 'ok'); route(); } catch (x) { falha(x); } };
  $$('[data-p]', main).forEach(b => b.onclick = () => go({ acao: 'ativar', plano: b.dataset.p })); $$('[data-a]', main).forEach(b => b.onclick = () => go({ acao: b.dataset.a }));
}
async function viewChamados(main) {
  const rows = await api('/e/chamados');
  main.innerHTML = `<div class="row"><h1 class="sp">Suporte</h1><button class="btn gold" id="novo">+ Abrir chamado</button></div><div class="tw"><table><tr><th>Quando</th><th>Assunto</th><th>Autor</th><th>Situação</th></tr>${rows.map(r => `<tr class="cl" data-id="${r.id}"><td>${fdt(r.criado)}</td><td>${esc(r.assunto)}</td><td>${esc(r.autor)}</td><td><span class="tag ${r.status === 'fechado' ? 'ok' : 'warn'}">${esc(r.status)}</span></td></tr>`).join('') || '<tr><td colspan="4" class="mut">Nenhum chamado.</td></tr>'}</table></div>`;
  $('#novo', main).onclick = () => { const F = [T('assunto', 'Assunto', { r: 1 }), { k: 'mensagem', l: 'Descreva o problema ou sugestão', t: 'textarea' }]; modal({ titulo: 'Abrir chamado', corpo: F.map(f => campo(f, '')).join('') + '<div id="ferr"></div>', botoes: [{ t: 'Cancelar', fn: c => c() }, { t: 'Enviar', cls: 'gold', fn: async (c, b, el) => { try { await api('/e/chamados', { m: 'POST', b: ler(F, el) }); c(); route(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } } }] }); };
  $$('tr.cl', main).forEach(tr => tr.onclick = () => { const r = rows.find(x => x.id == tr.dataset.id); modal({ titulo: r.assunto, corpo: `<p>${esc(r.mensagem)}</p><p class="mut">por ${esc(r.autor)}</p><div class="fld"><label>Resposta</label><textarea id="rsp">${esc(r.resposta)}</textarea></div>`, botoes: [{ t: 'Fechar janela', fn: c => c() }, { t: 'Responder', fn: async c => { try { await api(`/chamados/${r.id}/responder`, { m: 'POST', b: { resposta: $('#rsp').value } }); c(); route(); } catch (e) { falha(e); } } }, { t: 'Responder e fechar chamado', cls: 'gold', fn: async c => { try { await api(`/chamados/${r.id}/responder`, { m: 'POST', b: { resposta: $('#rsp').value, fechar: true } }); c(); route(); } catch (e) { falha(e); } } }] }); });
}
async function viewAud(main) { const r = await api('/auditoria'); main.innerHTML = `<h1>Auditoria</h1><p class="mut">Quem fez o quê e quando (últimos 300 registros).</p><div class="tw"><table><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr>${r.map(a => `<tr><td>${fdt(a.quando)}</td><td>${esc(a.usuario)}</td><td>${esc(a.acao)} <span class="mut">${esc(a.detalhe)}</span></td></tr>`).join('')}</table></div>`; }
async function viewEquipe(main) {
  const m = await api('/membros'); const adm = pode('admin');
  main.innerHTML = `<h1>Equipe e perfis</h1><div class="tw"><table><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th></th></tr>${m.map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.email)}</td><td>${esc(x.perfil)}</td><td class="r">${adm && x.id !== S.user.id ? `<button class="btn sm red" data-r="${x.id}">Remover</button>` : ''}</td></tr>`).join('')}</table></div>
  ${adm ? `<h3 style="margin-top:1rem">Adicionar pessoa a esta empresa</h3><div class="card"><p class="mut">A pessoa precisa ter criado a conta antes. Administrador: tudo. Financeiro: contas e compras. Vendedor: clientes, produtos e vendas. Contador: somente leitura (e valida cenários fiscais).</p><div class="grid"><div class="fld"><label>E-mail</label><input id="em"></div><div class="fld"><label>Perfil</label><select id="pf">${Object.keys(AREAS).map(p => `<option>${p}</option>`).join('')}</select></div></div><button class="btn gold" id="ad">Adicionar</button></div>` : ''}`;
  if (adm) { $('#ad', main).onclick = async () => { try { await api('/membros', { m: 'POST', b: { email: $('#em').value, perfil: $('#pf').value } }); toast('Adicionado.', 'ok'); route(); } catch (e) { falha(e); } }; $$('[data-r]', main).forEach(b => b.onclick = () => confirma('Remover esta pessoa da empresa?', async () => { try { await api('/membros/' + b.dataset.r, { m: 'DELETE' }); route(); } catch (e) { falha(e); } })); }
}
async function viewEmpresa(main) {
  const e = await api('/empresa'); const F = [T('razao', 'Razão social', { r: 1 }), T('fantasia', 'Nome fantasia'), T('cnpj', 'CNPJ'), T('ie', 'Inscrição estadual'), SEL('regime', 'Regime tributário', ['Simples Nacional', 'Lucro Presumido', 'Lucro Real']), SEL('uf', 'UF', UFS, { vazio: 1 }), T('cidade', 'Cidade'), T('cep', 'CEP'), T('endereco', 'Endereço'), T('numero', 'Número'), T('bairro', 'Bairro'), T('serie', 'Série da numeração'), { k: 'prox_nfe', l: 'Próximo número da nota (demo)', t: 'number' }, T('cert_demo', 'Certificado digital (apenas demonstrativo, sem uso real)')];
  main.innerHTML = `<h1>Empresa emitente</h1><div class="card"><div class="grid">${F.map(f => campo(f, f.k === 'cnpj' ? fcnpj(e[f.k]) : e[f.k])).join('')}</div><div class="row">${pode('admin') ? '<button class="btn" id="cn">Consultar CNPJ</button><button class="btn gold" id="sv">Salvar</button>' : '<span class="mut">Somente Administrador altera.</span>'}</div><div id="ferr"></div></div>`;
  if (!pode('admin')) return;
  $('#cn', main).onclick = () => consultaCnpj($('#f_cnpj').value, d => { const set = (k, v) => { if (v) $('#f_' + k).value = v; }; set('razao', d.razao_social); set('fantasia', d.nome_fantasia); set('uf', d.uf); set('cidade', d.municipio); set('endereco', d.logradouro); set('numero', d.numero); set('bairro', d.bairro); set('cep', d.cep); });
  $('#sv', main).onclick = async () => { try { await api('/empresa', { m: 'PUT', b: ler(F, main) }); toast('Empresa salva.', 'ok'); await carregaEu(); route(); } catch (x) { $('#ferr', main).innerHTML = listaErro(x); } };
}
function viewPend(main) {
  const L = [['Integração com provedor ou motor de NF-e', 'Hoje o XML é só demonstrativo, sem assinatura e sem envio.'], ['Certificado digital do emitente', 'Necessário para assinar notas reais (o campo atual é só demonstrativo).'], ['Homologação na SEFAZ', 'Testes oficiais de emissão antes de qualquer nota real.'], ['Gateway de pagamento', 'As assinaturas são simuladas; nenhuma cobrança real existe.'], ['Validação dos cenários fiscais por contador', 'Nenhuma natureza, CFOP, CST ou alíquota foi validada.'], ['Auditoria de segurança e backup', 'Backup automático e revisão de segurança ainda não feitos.'], ['Importar/exportar em XLSX', 'Nesta versão a importação e exportação usam CSV (abre no Excel) e JSON.'], ['PDF direto do servidor', 'O PDF é gerado pelo navegador (Imprimir › Salvar como PDF).'], ['Tabelas oficiais NCM e CFOP', 'Precisam ser importadas pelo usuário; nada vem pré-preenchido.'], ['Aplicativo para iOS e Android', 'Planejado para depois que o sistema web estiver validado.']];
  main.innerHTML = `<h1>Pendências para a versão real</h1><div class="aviso">Este sistema é uma <b>versão de teste</b>. Nada aqui tem valor fiscal.</div>${L.map(([a, b]) => `<div class="card" style="margin-bottom:.5rem"><b>${esc(a)}</b><div class="mut">${esc(b)}</div></div>`).join('')}`;
}

// ---------- casca ----------
const MENU = [['painel', 'Painel', '◈'], 'Vendas', ['orc', 'Orçamentos', '✎'], ['ped', 'Pedidos', '▤'], ['nfe', 'Notas (demo)', '▣'], ['clientes', 'Clientes', '☻'], ['produtos', 'Produtos', '◆'], 'Gestão', ['financeiro', 'Financeiro', '$'], ['estoque', 'Compras e estoque', '▦'], ['relatorios', 'Relatórios', '▥'], 'Fiscal', ['naturezas', 'Naturezas e CFOP', '§'], ['ncm_tab', 'Tabela NCM', '#'], ['cfop_tab', 'Tabela CFOP', '#'], ['icms_regras', 'Editor de ICMS', '%'], 'Conta', ['assinatura', 'Assinatura', '★'], ['chamados', 'Suporte', '?'], ['auditoria', 'Auditoria', '☰'], ['equipe', 'Equipe', '☺'], ['empresa', 'Empresa', '⌂'], ['pendencias', 'Pendências', '!']];
const BAR = [['painel', 'Painel', '◈'], ['orc', 'Vendas', '✎'], ['nfe', 'Notas', '▣'], ['financeiro', 'Financeiro', '$']];
function cur() { return (location.hash.replace(/^#\//, '') || 'painel').split('/')[0]; }
function renderShell() {
  const c = cur(), emp = S.empresas.map(e => `<option value="${e.id}" ${e.id == S.eid ? 'selected' : ''}>${esc(e.fantasia || e.razao)}</option>`).join('') + '<option value="novo">+ Nova empresa…</option>';
  const ativo = k => c === k || (c === 'doc' || c === 'novo' ? (S.docKind === k) : false) || (c === 'danfe' && k === 'nfe');
  $('#app').innerHTML = `<div id="shell"><nav id="side"><div class="logo">AVENTUREIRO ERP<small>versão de teste</small></div>${MENU.map(m => typeof m === 'string' ? `<div class="sec">${m}</div>` : `<a class="nv ${ativo(m[0]) ? 'on' : ''}" href="#/${m[0]}"><span>${m[2]}</span>${m[1]}</a>`).join('')}<div class="sec">Sessão</div><a class="nv" href="#" id="sair"><span>⏻</span>Sair</a></nav>
  <div id="main"><div id="top"><select id="sel">${emp}</select><span class="tag gold">${esc(S.perfil)}</span><span class="sp"></span><span class="mut" style="font-size:.8rem">${esc(S.user.nome)}</span></div><div class="demo">VERSÃO DE TESTE — SEM VALOR FISCAL - DEMONSTRAÇÃO. Dados fictícios. Nenhuma nota real e nenhuma cobrança real.</div><div id="view"></div></div></div>
  <nav id="bar">${BAR.map(m => `<a href="#/${m[0]}" class="${ativo(m[0]) || (m[0] === 'orc' && ['orc', 'ped'].includes(S.docKind)) ? 'on' : ''}"><b>${m[2]}</b>${m[1]}</a>`).join('')}<a href="#" id="mais"><b>☰</b>Mais</a></nav>`;
  $('#sel').onchange = e => { if (e.target.value === 'novo') { novaEmpresa(); e.target.value = S.eid; } else { S.eid = +e.target.value; store.set('eid', S.eid); setEmp(); location.hash = '#/painel'; route(); } };
  $('#sair').onclick = async e => { e.preventDefault(); await api('/auth/sair', { m: 'POST' }); S.user = null; start(); };
  $('#mais').onclick = e => { e.preventDefault(); const m = modal({ titulo: 'Menu', corpo: `<div class="grid g2">${MENU.filter(x => typeof x !== 'string').map(x => `<a class="btn" href="#/${x[0]}" data-c>${x[2]} ${x[1]}</a>`).join('')}<a class="btn" href="#" id="sair2">⏻ Sair</a></div>` }); $$('[data-c]', m.el).forEach(a => a.addEventListener('click', () => m.close())); $('#sair2', m.el).onclick = async ev => { ev.preventDefault(); await api('/auth/sair', { m: 'POST' }); m.close(); S.user = null; start(); }; };
}
function setEmp() { const e = S.empresas.find(x => x.id == S.eid); S.emp = e; S.perfil = e ? e.perfil : ''; }
async function carregaEu() { const r = await api('/eu'); S.user = r.user; S.empresas = r.empresas || []; S.codigo = r.codigo; if (!S.empresas.find(e => e.id == S.eid)) S.eid = S.empresas[0] ? S.empresas[0].id : 0; setEmp(); if (S.eid) { try { const e = await api('/empresa'); S.emp = { ...S.emp, ...e }; } catch { } } }
function novaEmpresa(primeira) {
  const F = [T('razao', 'Razão social', { r: 1 }), T('fantasia', 'Nome fantasia'), T('cnpj', 'CNPJ'), SEL('regime', 'Regime tributário', ['Simples Nacional', 'Lucro Presumido', 'Lucro Real']), SEL('uf', 'UF', UFS, { vazio: 1 })];
  const m = modal({ titulo: primeira ? 'Crie sua primeira empresa' : 'Nova empresa', fechar: !primeira, corpo: `<p class="mut">Use dados fictícios se preferir. Cada empresa tem dados totalmente separados.</p><div class="grid">${F.map(f => campo(f, '')).join('')}</div><button class="btn sm" id="cn" type="button">Consultar CNPJ</button><div id="ferr"></div>`, botoes: [{ t: 'Criar empresa', cls: 'gold', fn: async (c, b, el) => { await rodando(b, async () => { try { const r = await api('/empresas', { m: 'POST', b: ler(F, el) }); c(); S.eid = r.id; store.set('eid', r.id); await carregaEu(); location.hash = '#/painel'; route(); } catch (e) { $('#ferr', el).innerHTML = listaErro(e); } }); } }] });
  $('#cn', m.el).onclick = () => consultaCnpj($('#f_cnpj', m.el).value, d => { const set = (k, v) => { if (v) $('#f_' + k, m.el).value = v; }; set('razao', d.razao_social); set('fantasia', d.nome_fantasia); set('uf', d.uf); });
}
function viewLogin() {
  let modo = 'entrar';
  const des = () => {
    $('#app').innerHTML = `<div class="login"><div class="card"><div class="brand"><b>AVENTUREIRO ERP</b><div>Versão de teste — sem valor fiscal</div></div><div class="tabs"><a href="#" data-m="entrar" class="${modo === 'entrar' ? 'on' : ''}">Entrar</a><a href="#" data-m="criar" class="${modo === 'criar' ? 'on' : ''}">Criar conta</a></div>
    ${modo === 'criar' ? '<div class="fld"><label>Seu nome</label><input id="nome" autocomplete="name"></div>' : ''}<div class="fld"><label>E-mail</label><input id="email" type="email" autocomplete="email"></div><div class="fld"><label>Senha ${modo === 'criar' ? '(mínimo 6 caracteres)' : ''}</label><input id="senha" type="password" autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}"></div>
    ${modo === 'criar' && S.codigo ? '<div class="fld"><label>Código de convite</label><input id="codigo"></div>' : ''}<div id="ferr"></div><button class="btn gold" id="go" style="width:100%">${modo === 'criar' ? 'Criar conta' : 'Entrar'}</button><p class="mut" style="font-size:.78rem;text-align:center">Ambiente de demonstração. Não use senhas que você usa em outros lugares.</p></div></div>`;
    $$('[data-m]').forEach(a => a.onclick = e => { e.preventDefault(); modo = a.dataset.m; des(); });
    const go = async () => { const b = { email: $('#email').value, senha: $('#senha').value }; if (modo === 'criar') { b.nome = $('#nome').value; if ($('#codigo')) b.codigo = $('#codigo').value; } try { await rodando($('#go'), () => api(modo === 'criar' ? '/auth/registrar' : '/auth/entrar', { m: 'POST', b })); await start(); } catch (e) { $('#ferr').innerHTML = listaErro(e); } };
    $('#go').onclick = go; $$('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  }; des();
}
const ROTAS = { painel: m => viewPainel(m), orc: m => viewDocs(m, 'orc'), ped: m => viewDocs(m, 'ped'), nfe: m => viewDocs(m, 'nfe'), financeiro: (m, a) => viewFin(m, a[1]), estoque: m => viewEstoque(m), relatorios: m => viewRel(m), assinatura: m => viewAssin(m), chamados: m => viewChamados(m), auditoria: m => viewAud(m), equipe: m => viewEquipe(m), empresa: m => viewEmpresa(m), pendencias: m => viewPend(m) };
let tok = 0;
async function route() {
  if (!S.user) return; if (!S.eid) return novaEmpresa(true);
  const my = ++tok, a = (location.hash.replace(/^#\//, '') || 'painel').split('/'), c = a[0];
  S.docKind = ['orc', 'ped', 'nfe'].includes(c) ? c : c === 'novo' ? a[1] : null; renderShell(); const main = $('#view');
  main.innerHTML = '<p class="mut">Carregando…</p>';
  try {
    if (c === 'doc') { const d = await api('/docs/' + a[1]); S.docKind = d.kind; renderShell(); const m2 = $('#view'); await viewDoc(m2, d.kind, +a[1]); }
    else if (c === 'novo') await viewDoc(main, a[1], null);
    else if (c === 'danfe') await viewDanfe(main, +a[1]);
    else if (ENTS[c]) await viewEnt(main, c);
    else if (ROTAS[c]) await ROTAS[c](main, a);
    else main.innerHTML = '<p>Página não encontrada. <a href="#/painel">Voltar ao painel</a></p>';
  } catch (e) { if (my === tok && e.status !== 401) main.innerHTML = `<div class="err"><b>${esc(e.message)}</b></div><p><button class="btn" onclick="location.reload()">Tentar de novo</button></p>`; }
  scrollTo(0, 0);
}
async function start() {
  try { S.eid = +(store.get('eid') || 0); await carregaEu(); } catch { S.user = null; }
  if (!S.user) return viewLogin(); route();
}
addEventListener('hashchange', route);
start();
