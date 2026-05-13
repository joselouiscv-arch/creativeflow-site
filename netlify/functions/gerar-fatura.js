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

  const e = dados.empresa || {};
  const c = dados.cliente || {};
  const f = dados.fatura || {};

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const asNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const money = (value) => `${asNumber(value).toFixed(2)} CVE`;

  const formatDate = (value) => {
    if (!value) return '';
    const text = String(value);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return esc(text);
    return date.toLocaleDateString('pt-PT');
  };

  const cvNow = new Date(Date.now() - 60 * 60 * 1000);
  const horaFormatada = `${String(cvNow.getUTCHours()).padStart(2, '0')}:${String(cvNow.getUTCMinutes()).padStart(2, '0')}`;

  const detectImageMime = (base64) => {
    const raw = String(base64 || '').slice(0, 80);
    if (raw.startsWith('/9j/')) return 'image/jpeg';
    if (raw.startsWith('iVBOR')) return 'image/png';
    if (raw.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
  };

  const logoBase64 = dados.logo || null;
  const logoHtml = logoBase64
    ? `<img src="data:${detectImageMime(logoBase64)};base64,${logoBase64}" alt="Logo">`
    : `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="10" width="68" height="10" fill="white"/>
        <rect x="8" y="28" width="55" height="7" fill="white"/>
        <rect x="8" y="42" width="42" height="7" fill="white"/>
        <rect x="8" y="56" width="30" height="7" fill="white"/>
        <polygon points="70,15 105,15 105,85 70,85" fill="white" opacity="0.1"/>
        <polygon points="72,18 100,18 100,82" fill="none" stroke="white" stroke-width="3.5"/>
        <line x1="72" y1="20" x2="98" y2="80" stroke="white" stroke-width="4.5"/>
        <line x1="79" y1="20" x2="105" y2="80" stroke="white" stroke-width="4.5"/>
      </svg>`;

  const itens = Array.isArray(f.itens) ? f.itens : [];
  let subtotal = 0;

  const linhas = itens
    .filter((item) => item && String(item.descricao || '').trim())
    .map((item, index) => {
      const quantidade = asNumber(item.quantidade);
      const preco = asNumber(item.preco);
      const totalLinha = quantidade * preco;
      subtotal += totalLinha;
      return `<tr>
        <td><div class="td-inner"><span class="td-num">${String(index + 1).padStart(2, '0')}</span><span class="td-desc">${esc(item.descricao)}</span></div></td>
        <td>${preco.toFixed(2)}</td>
        <td>${quantidade}</td>
        <td>${money(totalLinha)}</td>
      </tr>`;
    });

  if (linhas.length === 0) {
    linhas.push(`<tr><td><div class="td-inner"><span class="td-num">01</span><span class="td-desc">Sem itens</span></div></td><td>0.00</td><td>0</td><td>0.00 CVE</td></tr>`);
  }

  const impostoPercentual = asNumber(f.imposto);
  const desconto = asNumber(f.desconto);
  const impostoValor = subtotal * (impostoPercentual / 100);
  const totalGeral = Math.max(0, subtotal + impostoValor - desconto);

  const pagamento = f.pagamento || {};
  const vint4Val = asNumber(pagamento.vint4);
  const dinheiroVal = asNumber(pagamento.dinheiro);

  const dataEmissao = formatDate(f.data);
  const dataValidade = formatDate(f.vencimento);

  const companyDetails = [
    ['Endereço:', e.morada], ['Nº Conta:', e.conta], ['NºNIF:', e.nif],
    ['Contato:', e.telefone], ['E-Mail:', e.email],
  ].filter(([, value]) => String(value ?? '').trim());

  const clientDetails = [
    ['Endereço:', c.morada], ['Contribuinte:', c.nif],
    ['Contato:', c.telefone], ['E-Mail:', c.email],
  ].filter(([, value]) => String(value ?? '').trim());

  const detailRows = (rows) => rows.map(([label, value]) => `<b>${esc(label)}</b><span>${esc(value)}</span>`).join('');

  const paymentRows = [
    vint4Val > 0 ? `<div class="payment-row"><span>VINT4</span><span>${money(vint4Val)}</span></div>` : '',
    dinheiroVal > 0 ? `<div class="payment-row"><span>Dinheiro</span><span>${money(dinheiroVal)}</span></div>` : '',
  ].join('') || `<div class="payment-row"><span>Pagamento</span><span>${money(totalGeral)}</span></div>`;

  const ITENS_PRIMEIRA = 18;
  const ITENS_OUTRAS = 26;
  const chunks = [linhas.slice(0, ITENS_PRIMEIRA)];
  for (let i = ITENS_PRIMEIRA; i < linhas.length; i += ITENS_OUTRAS) {
    chunks.push(linhas.slice(i, i + ITENS_OUTRAS));
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Barlow', sans-serif; background: #fff; }
    .page { background: #fff; width: 794px; height: 1123px; padding: 28px 34px 20px; color: #111; display: flex; flex-direction: column; overflow: hidden; position: relative; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-shrink: 0; }
    .logo-box { width: 276px; height: 116px; background: ${logoBase64 ? 'transparent' : '#111'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .logo-box svg { width: 220px; height: 88px; }
    .logo-box img { width: 276px; height: 116px; object-fit: contain; }
    .company-info { text-align: right; max-width: 420px; }
    .company-name { font-family: 'Barlow Condensed', sans-serif; font-size: 25px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px; }
    .company-slogan { font-family: 'Barlow Condensed', sans-serif; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
    .company-details, .client-details { font-size: 13px; line-height: 1.85; display: inline-grid; grid-template-columns: auto 1fr; column-gap: 10px; text-align: left; }
    .company-details b, .client-details b { font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
    .company-details span, .client-details span { text-align: right; }
    .divider { border: none; border-top: 1.5px solid #111; margin: 0 0 13px; flex-shrink: 0; }
    .client-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-shrink: 0; gap: 18px; }
    .client-name { font-family: 'Barlow Condensed', sans-serif; font-size: 21px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
    .right-block { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
    .fatura-word { font-family: 'Barlow Condensed', sans-serif; font-size: 44px; font-weight: 900; text-transform: uppercase; line-height: 1; letter-spacing: -1px; }
    .fatura-num { font-size: 13px; font-weight: 600; letter-spacing: 1px; margin-top: 3px; margin-bottom: 9px; }
    .date-boxes { display: flex; gap: 5px; }
    .date-box { border: 1px solid #bbb; padding: 6px 10px; min-width: 108px; background: #ebebeb; }
    .date-box.total { background: #111; border-color: #111; }
    .date-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #555; margin-bottom: 3px; }
    .date-box.total .date-label { color: #aaa; }
    .date-value { font-size: 11px; font-weight: 700; color: #111; }
    .date-box.total .date-value { color: #fff; }
    .table-wrap { flex: 1 1 auto; overflow: hidden; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table thead tr { background: #1a1a1a; color: #fff; }
    .items-table thead th { font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 11px 13px; }
    .items-table thead th:nth-child(1) { text-align: left; width: 50%; padding-left: 13px; }
    .items-table thead th:nth-child(2) { text-align: right; width: 18%; }
    .items-table thead th:nth-child(3) { text-align: center; width: 14%; }
    .items-table thead th:nth-child(4) { text-align: right; width: 18%; }
    .td-inner { display: flex; align-items: center; }
    .td-num { min-width: 32px; flex-shrink: 0; font-weight: 700; }
    .td-desc { font-weight: 700; padding-left: 16px; border-left: 1px solid #bbb; }
    .items-table tbody tr { border-bottom: 1px solid #eaeaea; }
    .items-table tbody tr:nth-child(even) { background: #f5f5f5; }
    .items-table tbody tr:nth-child(odd) { background: #fff; }
    .items-table tbody td { font-size: 13px; padding: 9.5px 13px; }
    .items-table tbody td:nth-child(1) { font-weight: 700; text-transform: uppercase; padding-left: 13px; }
    .items-table tbody td:nth-child(2) { text-align: right; font-weight: 600; }
    .items-table tbody td:nth-child(3) { text-align: center; font-weight: 600; }
    .items-table tbody td:nth-child(4) { text-align: right; font-weight: 600; }
    .bottom-section { flex-shrink: 0; display: flex; justify-content: space-between; align-items: flex-start; padding-top: 14px; }
    .payment-terms { width: 46%; }
    .block-title { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .payment-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #ccc; width: 100%; }
    .payment-row span:first-child { font-weight: 600; }
    .terms-text { font-size: 9px; color: #333; line-height: 1.5; text-align: justify; }
    .totals-block { width: 44%; }
    .total-row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; font-weight: 600; border-bottom: 1px solid #eee; }
    .total-row span:first-child { text-transform: uppercase; letter-spacing: 0.4px; color: #444; }
    .total-geral { background: #1a1a1a; color: #fff; display: flex; justify-content: space-between; padding: 11px 14px; margin-top: 8px; }
    .total-geral span { font-family: 'Barlow Condensed', sans-serif; font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
    .page-footer { flex-shrink: 0; padding-top: 14px; }
    .footer-divider { border: none; border-top: 1px solid #111; margin-bottom: 8px; }
    .footer-bar { display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #333; }
    .footer-item { display: flex; align-items: center; gap: 4px; }
    .continua { text-align: center; font-size: 9px; color: #888; padding-top: 10px; font-style: italic; }
  `;

  const tabela = (rows) => `
    <div class="table-wrap">
      <table class="items-table">
        <thead><tr>
          <th>Nº Descrição do Serviço / Produto</th>
          <th>Preç. Unitário</th><th>Qtd / Unid</th><th>Val. Total (CVE)</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;

  const footerCompleto = `
    <div class="bottom-section">
      <div class="payment-terms">
        <div class="block-title">Método de Pagamento</div>
        ${paymentRows}
        <div class="terms-block">
          <div class="block-title">Termos e Condições</div>
          <div class="terms-text">Os serviços descritos nesta fatura foram prestados conforme acordado. Qualquer contestação deverá ser comunicada por escrito no prazo de 5 dias úteis após receção.</div>
        </div>
      </div>
      <div class="totals-block">
        <div class="total-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
        <div class="total-row"><span>Imposto (${impostoPercentual}%)</span><span>${money(impostoValor)}</span></div>
        <div class="total-row"><span>Desconto</span><span>- ${money(desconto)}</span></div>
        <div class="total-geral"><span>Total Geral</span><span>${money(totalGeral)}</span></div>
      </div>
    </div>`;

  const footerBar = `
    <div class="page-footer">
      <hr class="footer-divider">
      <div class="footer-bar">
        <div class="footer-item">&#128196; Obrigado pela sua preferência!</div>
        <div class="footer-item">&#128222; ${esc(e.telefone)}</div>
        <div class="footer-item">&#9993; ${esc(e.email)}</div>
        <div class="footer-item">&#128205; Cabo Verde</div>
        <div class="footer-item">&#128336; ${horaFormatada}</div>
      </div>
    </div>`;

  let paginas = '';
  chunks.forEach((rows, index) => {
    const isPrimeira = index === 0;
    const isUltima = index === chunks.length - 1;
    if (isPrimeira) {
      paginas += `<div class="page">
        <div class="header">
          <div class="logo-box">${logoHtml}</div>
          <div class="company-info">
            <div class="company-name">${esc(e.nome || 'Nome da Empresa')}</div>
            <div class="company-slogan">${esc(e.slogan || '')}</div>
            <div class="company-details">${detailRows(companyDetails)}</div>
          </div>
        </div>
        <hr class="divider">
        <div class="client-row">
          <div class="client-info">
            <div class="client-name">${esc(c.nome || 'Cliente')}</div>
            <div class="client-details">${detailRows(clientDetails)}</div>
          </div>
          <div class="right-block">
            <div class="fatura-word">Fatura</div>
            <div class="date-boxes">
              <div class="date-box"><div class="date-label">Data de Emissão</div><div class="date-value">${dataEmissao}</div></div>
              <div class="date-box"><div class="date-label">Data de Validade</div><div class="date-value">${dataValidade}</div></div>
              <div class="date-box total"><div class="date-label">Total a Pagar</div><div class="date-value">${money(totalGeral)}</div></div>
            </div>
          </div>
        </div>
        ${tabela(rows)}
        ${isUltima ? footerCompleto : '<div class="continua">Continua na página seguinte...</div>'}
        ${footerBar}
      </div>`;
    } else {
      paginas += `<div class="page">${tabela(rows)}${isUltima ? footerCompleto : '<div class="continua">Continua na página seguinte...</div>'}${footerBar}</div>`;
    }
  });

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>Fatura</title><style>${css}</style></head><body>${paginas}</body></html>`;

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
      body: JSON.stringify({ pdf: Buffer.from(pdf).toString('base64'), filename: 'fatura.pdf' }),
    };
  } catch (err) {
    return { statusCode: 500, body: `Erro ao gerar PDF: ${err.message}` };
  } finally {
    if (browser) await browser.close();
  }
};
