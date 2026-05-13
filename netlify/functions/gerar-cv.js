const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let dados;
  try {
    dados = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Dados inválidos' };
  }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const formatDate = (value) => {
    if (!value) return '';
    const text = String(value);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return esc(text);
    return date.toLocaleDateString('pt-PT');
  };

  const toArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

  const cvNow = new Date(Date.now() - 60 * 60 * 1000);
  const dataGerado = cvNow.toLocaleDateString('pt-PT');

  const nome = esc(dados.nome || '');
  const apelido = esc(dados.apelido || '');
  const nomeCompleto = [nome, apelido].filter(Boolean).join(' ');
  const telefone = esc(dados.telefone || '');
  const email = esc(dados.email || '');
  const endereco = esc(dados.endereco || '');
  const postal = esc(dados.postal || '');
  const perfil = dados.perfil_profissional || '';

  const detectImageMime = (base64) => {
    const raw = String(base64 || '').trim().slice(0, 80);
    if (raw.startsWith('/9j/')) return 'image/jpeg';
    if (raw.startsWith('iVBOR')) return 'image/png';
    if (raw.startsWith('UklGR')) return 'image/webp';
    return 'image/webp';
  };

  const normalizePhotoSrc = (payload) => {
    const dataUrl = payload.foto || payload.photo || '';
    if (dataUrl && String(dataUrl).startsWith('data:image/')) return String(dataUrl);
    const base64 = payload.foto_base64 || payload.photo_base64 || '';
    if (!base64) return '';
    const mime = payload.foto_tipo || payload.photo_type || detectImageMime(base64);
    return `data:${mime};base64,${base64}`;
  };

  const photoSrc = normalizePhotoSrc(dados);
  const photoHtml = photoSrc
    ? `<img src="${photoSrc}" alt="Foto">`
    : `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="17" r="11"></circle><ellipse cx="25" cy="43" rx="20" ry="12"></ellipse></svg>`;

  const cargos = toArray(dados.cargo_pretendido);
  const cargoPrincipal = esc(cargos[0] || '');

  const expFuncao = toArray(dados.exp_funcao);
  const expEmpresa = toArray(dados.exp_empresa);
  const expLocal = toArray(dados.exp_local);
  const expInicio = toArray(dados.exp_inicio);
  const expFim = toArray(dados.exp_fim);
  const expDescricao = toArray(dados.exp_descricao);

  const expHtml = expFuncao.length === 0 ? '' : expFuncao.map((funcao, i) => {
    const inicio = formatDate(expInicio[i] || '');
    const fim = expFim[i] ? formatDate(expFim[i]) : 'presente';
    const local = esc(expLocal[i] || '');
    const empresa = esc(expEmpresa[i] || '');
    const desc = expDescricao[i] || '';
    const divider = i > 0 ? '<hr class="divider">' : '';
    const descHtml = desc.trim() ? `<div class="entry-desc">${desc}</div>` : '';
    return `${divider}<div class="entry">
      <div class="entry-date">${inicio}${inicio ? ' &ndash;<br>' : ''}${fim}</div>
      <div class="entry-content">
        <div class="entry-title">${esc(funcao)}</div>
        <div class="entry-org">${empresa}${local ? ` &mdash; ${local}` : ''}</div>
        ${descHtml}
      </div>
    </div>`;
  }).join('');

  const eduCurso = toArray(dados.edu_curso);
  const eduInst = toArray(dados.edu_inst);
  const eduLocal = toArray(dados.edu_local);
  const eduInicio = toArray(dados.edu_inicio);
  const eduFim = toArray(dados.edu_fim);

  const eduHtml = eduCurso.length === 0 ? '' : eduCurso.map((curso, i) => {
    const inicio = formatDate(eduInicio[i] || '');
    const fim = eduFim[i] ? formatDate(eduFim[i]) : 'presente';
    const local = esc(eduLocal[i] || '');
    const inst = esc(eduInst[i] || '');
    const divider = i > 0 ? '<hr class="divider">' : '';
    return `${divider}<div class="entry">
      <div class="entry-date">${inicio}${inicio ? ' &ndash;<br>' : ''}${fim}</div>
      <div class="entry-content">
        <div class="entry-title">${esc(curso)}</div>
        <div class="entry-org">${inst}${local ? ` &mdash; ${local}` : ''}</div>
      </div>
    </div>`;
  }).join('');

  const langLevel = (value) => {
    const raw = String(value || '').trim();
    const upper = raw.toUpperCase();
    const direct = upper.match(/^(A1|A2|B1|B2|C1|C2)$/);
    if (direct) return direct[1];
    const map = { ELEMENTAR: 'A1', BASICO: 'A2', INTERMEDIARIO: 'B1', 'INTERMEDIÁRIO': 'B1', INDEPENDENTE: 'B2', AVANCADO: 'C1', 'AVANÇADO': 'C1', FLUENTE: 'C2', NATIVO: 'Nativo' };
    return map[upper] || raw;
  };

  const idiomaArr = toArray(dados.idioma);
  const idiomaOuvir = toArray(dados.idioma_ouvir);
  const idiomaLer = toArray(dados.idioma_ler);
  const idiomaInt = toArray(dados.idioma_interacao);
  const idiomaProd = toArray(dados.idioma_producao);
  const idiomaEscr = toArray(dados.idioma_escrever);

  const idiomaRows = idiomaArr.map((idioma, i) => `<tr>
    <td class="lang-name">${esc(idioma)}</td>
    <td>${esc(langLevel(idiomaOuvir[i]))}</td>
    <td>${esc(langLevel(idiomaLer[i]))}</td>
    <td>${esc(langLevel(idiomaInt[i]))}</td>
    <td>${esc(langLevel(idiomaProd[i]))}</td>
    <td>${esc(langLevel(idiomaEscr[i]))}</td>
  </tr>`).join('');

  const idiomasHtml = idiomaArr.length > 0 ? `
    <div class="lang-other">Outra(s) l&iacute;ngua(s)</div>
    <table class="lang-table">
      <thead>
        <tr>
          <th rowspan="2" style="text-align:left;padding-left:6px;background:#f8fafc;border:0.5px solid #c5d4e4;"></th>
          <th colspan="2" class="group-header">Compreens&atilde;o</th>
          <th colspan="2" class="group-header">Produ&ccedil;&atilde;o Oral</th>
          <th class="group-header">Produ&ccedil;&atilde;o Escrita</th>
        </tr>
        <tr><th>Ouvir</th><th>Ler</th><th>Intera&ccedil;&atilde;o</th><th>Produ&ccedil;&atilde;o</th><th>Escrever</th></tr>
      </thead>
      <tbody>${idiomaRows}</tbody>
    </table>
    <p class="lang-note">N&iacute;veis: A1/A2: Utilizador elementar &mdash; B1/B2: Utilizador independente &mdash; C1/C2: Utilizador avan&ccedil;ado</p>` : '';

  const compTipo = toArray(dados.comp_tipo);
  const compNivel = toArray(dados.comp_nivel);
  const compHtml = compTipo.length > 0
    ? `<ul class="comp-list">${compTipo.map((t, i) => `<li>${esc(t)}${compNivel[i] ? ` <span style="color:#888;">(${esc(compNivel[i])})</span>` : ''}</li>`).join('')}</ul>`
    : '';

  const interessesArr = toArray(dados.interesses);
  const interessesHtml = interessesArr.length > 0
    ? `<ul class="comp-list">${interessesArr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '';

  const certificacoes = dados.certificacoes || '';
  const premios = dados.premios || '';
  const publicacoes = dados.publicacoes || '';
  const observacoes = dados.observacoes || '';
  const adicionaisItens = [certificacoes, premios, publicacoes, observacoes].filter(v => String(v || '').trim());
  const adicionaisHtml = adicionaisItens.length > 0
    ? adicionaisItens.map(v => `<div class="rich-block">${v}</div>`).join('')
    : '';

  const secExperiencia = expHtml ? `
    <hr class="sec-divider-h">
    <div class="cv-section">
      <div class="sec-left"><div class="sec-label"><span class="sec-label-icon"><svg viewBox="0 0 16 16"><path d="M5.5 4V3.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V4"></path><rect x="2" y="4.5" width="12" height="8.5" rx="1.4"></rect><path d="M2 7.5h12M7 7.5v1h2v-1"></path></svg></span>Experi&ecirc;ncia profissional</div></div>
      <div class="sec-divider-v"></div>
      <div class="sec-right">${expHtml}</div>
    </div>` : '';

  const secEducacao = eduHtml ? `
    <hr class="sec-divider-h">
    <div class="cv-section">
      <div class="sec-left"><div class="sec-label"><span class="sec-label-icon"><svg viewBox="0 0 16 16"><path d="M1.8 5.2L8 2l6.2 3.2L8 8.4 1.8 5.2Z"></path><path d="M4.2 6.4v3c0 .8 1.7 1.9 3.8 1.9s3.8-1.1 3.8-1.9v-3"></path></svg></span>Educa&ccedil;&atilde;o e forma&ccedil;&atilde;o</div></div>
      <div class="sec-divider-v"></div>
      <div class="sec-right">${eduHtml}</div>
    </div>` : '';

  const secCompetencias = (idiomasHtml || compHtml || interessesHtml) ? `
    <hr class="sec-divider-h">
    <div class="cv-section">
      <div class="sec-left"><div class="sec-label"><span class="sec-label-icon"><svg viewBox="0 0 16 16"><circle cx="8" cy="5.2" r="2.2"></circle><path d="M3.2 13c.5-2.1 2.4-3.6 4.8-3.6s4.3 1.5 4.8 3.6"></path></svg></span>Compet&ecirc;ncias pessoais</div></div>
      <div class="sec-divider-v"></div>
      <div class="sec-right">
        ${idiomasHtml}
        ${compHtml ? `<div class="comp-title">Compet&ecirc;ncias</div>${compHtml}` : ''}
        ${interessesHtml ? `<div class="comp-title">Interesses</div>${interessesHtml}` : ''}
      </div>
    </div>` : '';

  const secAdicionais = adicionaisHtml ? `
    <hr class="sec-divider-h">
    <div class="cv-section section-keep">
      <div class="sec-left"><div class="sec-label"><span class="sec-label-icon"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 7v3.4M8 4.8h.01"></path></svg></span>Informa&ccedil;&otilde;es adicionais</div></div>
      <div class="sec-divider-v"></div>
      <div class="sec-right">${adicionaisHtml}</div>
    </div>` : '';

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 0; }
    html, body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #222; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { background: #fff; width: auto; min-height: auto; margin: 0; padding: 68px 60px 96px 60px; position: relative; }
    .print-top-bar, .print-bottom-bar { position: fixed; left: 0; right: 0; height: 12px; background: #1a3a5c; z-index: 1000; }
    .print-top-bar { top: 0; }
    .print-bottom-bar { bottom: 0; }
    .cv-footer { position: fixed; left: 60px; right: 60px; bottom: 32px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10px; color: #888; font-style: italic; background: #fff; z-index: 1001; }
    .cv-header { display: grid; grid-template-columns: 200px 1px 1fr auto; gap: 0; align-items: start; padding-bottom: 18px; border-bottom: 0.7px solid #1a3a5c; margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid; }
    .header-photo-col { display: flex; align-items: flex-start; justify-content: center; }
    .photo { width: 100px; height: 100px; border-radius: 50%; background: #c8c8c8; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo svg { width: 60px; height: 60px; fill: #888; }
    .header-divider-v { background: #dde3ec; align-self: stretch; }
    .header-text { padding-left: 22px; min-height: 100px; display: flex; flex-direction: column; justify-content: center; }
    .header-text h1 { font-size: 28px; font-weight: 700; color: #1a3a5c; letter-spacing: 0.5px; line-height: 1.1; }
    .header-text p { font-size: 14px; color: #666; margin-top: 4px; }
    .cv-logo { font-size: 32px; font-weight: 700; color: #1a3a5c; letter-spacing: 2px; align-self: flex-start; padding-left: 16px; }
    .cv-body { display: block; padding-bottom: 2mm; }
    .cv-section { display: grid; grid-template-columns: 200px 1px 1fr; gap: 0; break-inside: auto; page-break-inside: auto; }
    .section-keep { break-inside: avoid; page-break-inside: avoid; }
    .sec-left { padding-right: 16px; padding-top: 3px; padding-bottom: 18px; }
    .sec-divider-v { background: #dde3ec; align-self: stretch; }
    .sec-right { padding-left: 22px; padding-bottom: 18px; padding-top: 3px; }
    .sec-divider-h { border: none; border-top: 0.5px solid #dde3ec; margin: 0; }
    .contact-block { padding-top: 1px; }
    .contact-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 10.5px; font-weight: 700; color: #1a3a5c; letter-spacing: 1.2px; text-transform: uppercase; }
    .contact-heading::after { content: ""; flex: 1; height: 0.5px; background: #b9c5d3; }
    .contact-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; color: #333; line-height: 1.25; break-inside: avoid; page-break-inside: avoid; }
    .contact-item:last-child { margin-bottom: 0; }
    .contact-icon { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #1a3a5c; }
    .contact-icon svg { width: 12px; height: 12px; stroke: #fff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; display: block; }
    .contact-copy { display: flex; flex-direction: column; min-width: 0; }
    .contact-label { font-size: 11px; font-weight: 700; color: #2a2f36; margin-bottom: 1px; }
    .contact-value { font-size: 10.5px; color: #6a6a6a; word-break: break-word; }
    .sec-label { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: #1a3a5c; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; line-height: 1.2; white-space: nowrap; }
    .sec-label-icon { width: 11px; height: 11px; display: inline-flex; flex-shrink: 0; }
    .sec-label-icon svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .divider { border: none; border-top: 0.5px solid #ddd; margin: 10px 0; }
    .sec-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .sec-title svg { width: 18px; height: 18px; fill: #1a3a5c; flex-shrink: 0; }
    .sec-title span { font-size: 11px; font-weight: 700; color: #1a3a5c; letter-spacing: 1px; text-transform: uppercase; }
    .profile-text { font-size: 12px; line-height: 1.55; color: #333; text-align: justify; margin-bottom: 12px; }
    .entry { display: grid; grid-template-columns: 110px 1fr; gap: 12px; margin-bottom: 11px; align-items: flex-start; break-inside: avoid; page-break-inside: avoid; }
    .entry-date { font-size: 11px; color: #888; line-height: 1.4; padding-top: 2px; }
    .entry-content { display: flex; flex-direction: column; }
    .entry-title { font-size: 13px; font-weight: 700; color: #1a3a5c; margin-bottom: 2px; line-height: 1.2; }
    .entry-org { font-size: 12px; color: #333; margin-bottom: 4px; }
    .entry-desc { font-size: 11px; color: #444; margin-top: 4px; line-height: 1.5; }
    .lang-other { font-size: 11px; color: #555; margin-bottom: 8px; }
    .lang-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 6px 0; break-inside: avoid; page-break-inside: avoid; }
    .lang-table .group-header { background: #dce6f0; color: #1a3a5c; font-weight: 700; text-align: center; padding: 5px 3px; font-size: 9px; letter-spacing: 0.7px; text-transform: uppercase; border: 0.5px solid #c5d4e4; }
    .lang-table th { background: #eef2f7; color: #1a3a5c; font-weight: 700; text-align: center; padding: 6px 3px; font-size: 10px; text-transform: uppercase; border: 0.5px solid #c5d4e4; }
    .lang-table td { border: 0.5px solid #ddd; text-align: center; padding: 6px 3px; color: #333; }
    .lang-table .lang-name { text-align: left; padding-left: 8px; font-weight: 500; color: #1a3a5c; background: #f8fafc; }
    .lang-note { font-size: 10px; color: #666; margin: 6px 0 12px; font-style: italic; line-height: 1.35; }
    .comp-title { font-size: 12px; font-weight: 700; color: #1a3a5c; margin-top: 10px; margin-bottom: 4px; }
    .comp-list { list-style: none; padding: 0; font-size: 11px; color: #444; }
    .comp-list li::before { content: "- "; }
    .comp-list li { margin-bottom: 2px; }
    .rich-block { font-size: 11px; color: #444; margin-bottom: 6px; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; }
  `;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Curriculum Vitae &mdash; ${nomeCompleto}</title>
  <style>${css}</style>
</head>
<body>
<div class="print-top-bar"></div>
<div class="print-bottom-bar"></div>
<div class="cv-footer">
  <span>Curriculum Vitae &mdash; ${nomeCompleto}</span>
  <span>Gerado em ${dataGerado}</span>
</div>
<div class="page">
  <div class="cv-header">
    <div class="header-photo-col"><div class="photo">${photoHtml}</div></div>
    <div class="header-divider-v"></div>
    <div class="header-text">
      <h1>${nomeCompleto || 'NOME COMPLETO'}</h1>
      <p>${cargoPrincipal || 'Cargo / &Aacute;rea pretendida'}</p>
    </div>
    <div class="cv-logo">CV</div>
  </div>
  <div class="cv-body">
    <div class="cv-section">
      <div class="sec-left">
        <div class="contact-block">
          <div class="contact-heading">Contacto</div>
          ${telefone ? `<div class="contact-item"><div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6A2 2 0 0 1 22 16.9Z"></path></svg></div><div class="contact-copy"><div class="contact-label">Telefone</div><div class="contact-value">${telefone}</div></div></div>` : ''}
          ${email ? `<div class="contact-item"><div class="contact-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg></div><div class="contact-copy"><div class="contact-label">E-mail</div><div class="contact-value">${email}</div></div></div>` : ''}
          ${endereco ? `<div class="contact-item"><div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg></div><div class="contact-copy"><div class="contact-label">Endere&ccedil;o</div><div class="contact-value">${endereco}</div></div></div>` : ''}
          ${postal ? `<div class="contact-item"><div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"></path><path d="M4 8l8 5 8-5"></path></svg></div><div class="contact-copy"><div class="contact-label">C&oacute;digo postal</div><div class="contact-value">${postal}</div></div></div>` : ''}
        </div>
      </div>
      <div class="sec-divider-v"></div>
      <div class="sec-right">
        <div class="sec-title">
          <svg viewBox="0 0 14 14"><circle cx="7" cy="5" r="3" fill="#1a3a5c"></circle><path d="M1 13c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="#1a3a5c"></path></svg>
          <span>Perfil Profissional</span>
        </div>
        <div class="profile-text">${perfil || ''}</div>
      </div>
    </div>
    ${secExperiencia}
    ${secEducacao}
    ${secCompetencias}
    ${secAdicionais}
  </div>
</div>
</body>
</html>`;

  const isLocal = process.env.NETLIFY_DEV === 'true';

  let browser;
  try {
    browser = await puppeteer.launch(isLocal ? {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    } : {
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf: Buffer.from(pdf).toString('base64'),
        filename: `cv-${nomeCompleto.replace(/\s+/g, '-')}.pdf`,
      }),
    };
  } catch (err) {
    console.error('ERRO DETALHADO:', err);
    return { statusCode: 500, body: `Erro ao gerar PDF: ${err.message}\n\nStack: ${err.stack}` };
  } finally {
    if (browser) await browser.close();
  }
};
