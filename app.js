const APP_VERSION = 1;
const STORAGE_KEY = "portfoytakip.state.v1";
const SNAPSHOT_KEY = "portfoytakip.snapshots.v1";
const MAX_SNAPSHOTS = 20;

const ASSET_TYPES = [
  { value: "stock", label: "Hisse Senedi", color: "#0f8b8d" },
  { value: "fund", label: "Yatirim Fonu", color: "#2ea6ff" },
  { value: "moneyMarket", label: "Para Piyasasi Fonu", color: "#79b45b" },
  { value: "fx", label: "Doviz", color: "#e39b2d" },
  { value: "metal", label: "Altin / Gumus", color: "#efb54d" },
  { value: "crypto", label: "Kripto Para", color: "#ff8c42" },
  { value: "bes", label: "BES Birikimi", color: "#9f6bff" },
  { value: "cash", label: "Nakit", color: "#4d83ff" },
];

const TRANSACTION_KINDS = [
  { value: "BUY", label: "Alim" },
  { value: "SELL", label: "Satis" },
  { value: "DIVIDEND", label: "Temettu" },
  { value: "CASH_IN", label: "Nakit Girisi" },
  { value: "CASH_OUT", label: "Nakit Cikisi" },
];

const app = {
  state: loadState(),
  activeSection: "dashboard",
  selectedPortfolioId: null,
  assetSearch: "",
  assetPortfolioFilter: "all",
  transactionKindFilter: "ALL",
  transactionPortfolioFilter: "all",
  deferredInstallPrompt: null,
};

boot();

function boot() {
  app.selectedPortfolioId = app.state.portfolios[0]?.id ?? null;
  applyTheme();
  bindCoreEvents();
  hydrateForms();
  render();
  syncOnlineStatus();
  registerServiceWorker();

  if (app.state.settings.autoPriceRefresh && navigator.onLine) {
    refreshMarketData({ silent: true });
  }
}

function bindCoreEvents() {
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.section));
  });

  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => openDialog(button.dataset.openDialog));
  });

  window.addEventListener("online", () => {
    syncOnlineStatus();
    toast("Baglanti tekrar kuruldu.");
    if (app.state.settings.autoPriceRefresh) {
      refreshMarketData({ silent: true });
    }
  });

  window.addEventListener("offline", () => {
    syncOnlineStatus();
    toast("Cevrimdisi mod aktif. Kayitlar yerel olarak korunuyor.");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    app.deferredInstallPrompt = event;
    document.querySelector("#install-button").hidden = false;
  });

  document.querySelector("#install-button").addEventListener("click", async () => {
    if (!app.deferredInstallPrompt) {
      return;
    }
    app.deferredInstallPrompt.prompt();
    await app.deferredInstallPrompt.userChoice;
    app.deferredInstallPrompt = null;
    document.querySelector("#install-button").hidden = true;
  });

  document.querySelector("#theme-button").addEventListener("click", cycleTheme);
  document.querySelector("#backup-button").addEventListener("click", () => openDialog("backup"));
  document.querySelector("#refresh-prices-button").addEventListener("click", () => refreshMarketData());
  document.querySelector("#export-button").addEventListener("click", exportState);
  document.querySelector("#snapshot-button").addEventListener("click", () => {
    pushSnapshot("manual");
    render();
    toast("Yerel kurtarma noktasi olusturuldu.");
  });
  document.querySelector("#reset-button").addEventListener("click", resetAllData);
  document.querySelector("#import-input").addEventListener("change", importState);

  document.querySelector("#asset-search").addEventListener("input", (event) => {
    app.assetSearch = event.target.value.trim().toLowerCase();
    renderAssets();
  });

  document.querySelector("#asset-portfolio-filter").addEventListener("change", (event) => {
    app.assetPortfolioFilter = event.target.value;
    renderAssets();
  });

  document.querySelector("#transaction-kind-filter").addEventListener("change", (event) => {
    app.transactionKindFilter = event.target.value;
    renderTransactions();
  });

  document.querySelector("#transaction-portfolio-filter").addEventListener("change", (event) => {
    app.transactionPortfolioFilter = event.target.value;
    renderTransactions();
  });

  document.querySelector("#save-portfolio-button").addEventListener("click", savePortfolioFromForm);
  document.querySelector("#save-asset-button").addEventListener("click", saveAssetFromForm);
  document.querySelector("#save-transaction-button").addEventListener("click", saveTransactionFromForm);

  document.querySelector("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    app.state.settings = {
      baseCurrency: form.get("baseCurrency"),
      decimalPlaces: Number(form.get("decimalPlaces")),
      compactNumbers: form.get("compactNumbers") === "on",
      autoPriceRefresh: form.get("autoPriceRefresh") === "on",
      theme: app.state.settings.theme,
    };
    persistState("settings");
    applyTheme();
    render();
    toast("Ayarlar kaydedildi.");
  });

  document.querySelector("#transaction-form [name='kind']").addEventListener("change", syncTransactionFormVisibility);
  document.querySelector("#transaction-form [name='portfolioId']").addEventListener("change", syncTransactionAssetOptions);
  document.querySelector("#asset-form [name='feedType']").addEventListener("change", syncAssetFeedFields);
}

function hydrateForms() {
  populateSelect(
    document.querySelector("#asset-form [name='type']"),
    ASSET_TYPES.map((type) => ({ value: type.value, label: type.label })),
  );

  populateSelect(
    document.querySelector("#transaction-form [name='kind']"),
    TRANSACTION_KINDS.map((kind) => ({ value: kind.value, label: kind.label })),
  );

  hydratePortfolioOptions();
  hydrateAssetOptions();
  hydrateFilters();
  hydrateSettingsForm();
}

function hydratePortfolioOptions() {
  const portfolioOptions = app.state.portfolios.map((portfolio) => ({
    value: portfolio.id,
    label: portfolio.name,
  }));

  populateSelect(document.querySelector("#asset-form [name='portfolioId']"), portfolioOptions);
  populateSelect(document.querySelector("#transaction-form [name='portfolioId']"), portfolioOptions);
}

function hydrateAssetOptions() {
  const selectedPortfolioId =
    document.querySelector("#transaction-form [name='portfolioId']").value || app.state.portfolios[0]?.id;

  const assetOptions = app.state.assets
    .filter((asset) => asset.portfolioId === selectedPortfolioId)
    .map((asset) => ({
      value: asset.id,
      label: `${asset.name}${asset.symbol ? ` (${asset.symbol})` : ""}`,
    }));

  populateSelect(document.querySelector("#transaction-form [name='assetId']"), [
    { value: "", label: "Seciniz" },
    ...assetOptions,
  ]);
}

function hydrateFilters() {
  const portfolioOptions = [{ value: "all", label: "Tum portfoyler" }].concat(
    app.state.portfolios.map((portfolio) => ({ value: portfolio.id, label: portfolio.name })),
  );

  populateSelect(document.querySelector("#asset-portfolio-filter"), portfolioOptions);
  populateSelect(document.querySelector("#transaction-portfolio-filter"), portfolioOptions);
  populateSelect(document.querySelector("#transaction-kind-filter"), [
    { value: "ALL", label: "Tum islemler" },
    ...TRANSACTION_KINDS.map((kind) => ({ value: kind.value, label: kind.label })),
  ]);

  document.querySelector("#asset-portfolio-filter").value = app.assetPortfolioFilter;
  document.querySelector("#transaction-portfolio-filter").value = app.transactionPortfolioFilter;
  document.querySelector("#transaction-kind-filter").value = app.transactionKindFilter;
}

function hydrateSettingsForm() {
  const form = document.querySelector("#settings-form");
  form.elements.baseCurrency.value = app.state.settings.baseCurrency;
  form.elements.decimalPlaces.value = String(app.state.settings.decimalPlaces);
  form.elements.compactNumbers.checked = app.state.settings.compactNumbers;
  form.elements.autoPriceRefresh.checked = app.state.settings.autoPriceRefresh;
}

function setSection(section) {
  app.activeSection = section;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${section}`);
  });
  document.querySelectorAll(".nav-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.section === section);
  });
}

function render() {
  hydratePortfolioOptions();
  hydrateAssetOptions();
  hydrateFilters();
  hydrateSettingsForm();
  renderDashboard();
  renderPortfolios();
  renderAssets();
  renderTransactions();
  renderReports();
  renderBackupStatus();
  renderSnapshots();
  syncTransactionFormVisibility();
  syncAssetFeedFields();
  syncOnlineStatus();
}

function renderDashboard() {
  const overview = deriveAppOverview();
  document.querySelector("#hero-total-value").textContent = formatCurrency(overview.totalValue);
  document.querySelector("#hero-summary").textContent = `${overview.openPositions} acik pozisyon, ${overview.portfolioCount} portfoy, ${formatCurrency(overview.cashBalance)} nakit dengesi.`;

  document.querySelector("#metric-grid").innerHTML = [
    metricCard("Toplam Deger", formatCurrency(overview.totalValue)),
    metricCard("Net Getiri", formatSignedCurrency(overview.totalReturn)),
    metricCard("Nakit Dengesi", formatSignedCurrency(overview.cashBalance)),
    metricCard("Net Katki", formatCurrency(overview.netContributions)),
    metricCard("Gerceklesen K/Z", formatSignedCurrency(overview.realizedPnL)),
    metricCard("Gerceklesmemis K/Z", formatSignedCurrency(overview.unrealizedPnL)),
    metricCard("Temettu Geliri", formatCurrency(overview.dividends)),
    metricCard("Veri Durumu", `${overview.assetsMissingPrices} eksik fiyat`),
  ].join("");

  renderAllocation(overview.allocation);

  document.querySelector("#performance-highlights").innerHTML = [
    stackMetric("Toplam getiri orani", formatPercent(overview.returnRate), overview.returnRate),
    stackMetric("En buyuk portfoy", overview.largestPortfolio?.name ?? "Henuz yok", null, overview.largestPortfolio ? formatCurrency(overview.largestPortfolio.totalValue) : "Portfoy ekle"),
    stackMetric("En iyi varlik", overview.bestAsset?.name ?? "Henuz yok", overview.bestAsset?.totalReturn ?? null, overview.bestAsset ? formatPercent(overview.bestAsset.returnRate) : "Islem kaydi ekle"),
    stackMetric("En zayif varlik", overview.worstAsset?.name ?? "Henuz yok", overview.worstAsset?.totalReturn ?? null, overview.worstAsset ? formatPercent(overview.worstAsset.returnRate) : "Fiyat ve islem kontrolu onerilir"),
  ].join("");

  document.querySelector("#recent-transactions").innerHTML = renderTransactionsTable(
    [...app.state.transactions]
      .sort((left, right) => sortByDateDesc(left.date, right.date))
      .slice(0, 8),
  );
}

function renderPortfolios() {
  const list = document.querySelector("#portfolio-list");
  const detail = document.querySelector("#portfolio-detail");

  if (!app.state.portfolios.length) {
    list.innerHTML = emptyState("Ilk portfoyunu olusturarak basla.");
    detail.innerHTML = emptyState("Portfoy bulunamadi.");
    return;
  }

  list.innerHTML = app.state.portfolios
    .map((portfolio) => {
      const metrics = derivePortfolio(portfolio.id);
      return `
        <article class="portfolio-card">
          <div class="portfolio-card-head">
            <div>
              <strong>${escapeHtml(portfolio.name)}</strong>
              <p class="stack-copy">${escapeHtml(portfolio.strategy || "Yatirim stratejisi tanimlanmadi.")}</p>
            </div>
            <span class="pill">${metrics.assets.length} varlik</span>
          </div>
          <div class="metric-row">
            <div>
              <span class="subtle">Toplam deger</span>
              <strong class="numeric">${formatCurrency(metrics.totalValue)}</strong>
            </div>
            <div>
              <span class="subtle">Getiri</span>
              <strong class="numeric ${signedClass(metrics.totalReturn)}">${formatSignedCurrency(metrics.totalReturn)}</strong>
            </div>
          </div>
          <div class="button-row wrap">
            <button class="secondary-button" data-select-portfolio="${portfolio.id}">Detay</button>
            <button class="secondary-button" data-edit-portfolio="${portfolio.id}">Duzenle</button>
            <button class="danger-button" data-delete-portfolio="${portfolio.id}">Sil</button>
          </div>
        </article>
      `;
    })
    .join("");

  detail.innerHTML = renderPortfolioDetail(app.selectedPortfolioId ?? app.state.portfolios[0].id);

  list.querySelectorAll("[data-select-portfolio]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedPortfolioId = button.dataset.selectPortfolio;
      renderPortfolios();
    });
  });
  list.querySelectorAll("[data-edit-portfolio]").forEach((button) => {
    button.addEventListener("click", () => openDialog("portfolio", button.dataset.editPortfolio));
  });
  list.querySelectorAll("[data-delete-portfolio]").forEach((button) => {
    button.addEventListener("click", () => deletePortfolio(button.dataset.deletePortfolio));
  });
}

function renderPortfolioDetail(portfolioId) {
  const portfolio = app.state.portfolios.find((item) => item.id === portfolioId);

  if (!portfolio) {
    return emptyState("Secili portfoy bulunamadi.");
  }

  const metrics = derivePortfolio(portfolio.id);
  const topAssets = [...metrics.assets]
    .sort((left, right) => right.currentValue - left.currentValue)
    .slice(0, 4);

  return `
    <article class="stack-card">
      <strong>${escapeHtml(portfolio.name)}</strong>
      <p class="stack-copy">${escapeHtml(portfolio.notes || "Bu portfoy icin henuz not eklenmedi.")}</p>
    </article>
    ${stackMetric("Toplam deger", formatCurrency(metrics.totalValue))}
    ${stackMetric("Toplam getiri", formatSignedCurrency(metrics.totalReturn), metrics.totalReturn)}
    ${stackMetric("Nakit dengesi", formatSignedCurrency(metrics.cashBalance), metrics.cashBalance)}
    ${stackMetric("Net dis katkilar", formatCurrency(metrics.netContributions))}
    ${topAssets.length ? `
      <article class="stack-card">
        <div class="stack-row">
          <strong>En buyuk pozisyonlar</strong>
          <span class="subtle">${topAssets.length} kalem</span>
        </div>
        ${topAssets
          .map(
            (asset) => `
            <p>${escapeHtml(asset.name)} · <span class="numeric">${formatCurrency(asset.currentValue)}</span></p>
          `,
          )
          .join("")}
      </article>
    ` : emptyState("Bu portfoyde henuz acik pozisyon yok.")}
  `;
}

function renderAssets() {
  const assets = deriveAssetsForView();
  document.querySelector("#asset-table").innerHTML = renderAssetsTable(assets);

  document.querySelectorAll("[data-edit-asset]").forEach((button) => {
    button.addEventListener("click", () => openDialog("asset", button.dataset.editAsset));
  });
  document.querySelectorAll("[data-delete-asset]").forEach((button) => {
    button.addEventListener("click", () => deleteAsset(button.dataset.deleteAsset));
  });
}

function renderTransactions() {
  const transactions = deriveTransactionsForView();
  document.querySelector("#transaction-table").innerHTML = renderTransactionsTable(transactions);

  document.querySelectorAll("[data-edit-transaction]").forEach((button) => {
    button.addEventListener("click", () => openDialog("transaction", button.dataset.editTransaction));
  });
  document.querySelectorAll("[data-delete-transaction]").forEach((button) => {
    button.addEventListener("click", () => deleteTransaction(button.dataset.deleteTransaction));
  });
}

function renderReports() {
  const overview = deriveAppOverview();
  const performance = [...overview.assets]
    .sort((left, right) => right.totalReturn - left.totalReturn)
    .slice(0, 5);
  const weakAssets = [...overview.assets]
    .sort((left, right) => left.totalReturn - right.totalReturn)
    .slice(0, 5);

  document.querySelector("#asset-performance-report").innerHTML = [
    performance.length
      ? `
        <article class="stack-card">
          <strong>En iyi varliklar</strong>
          ${performance
            .map(
              (asset) => `
              <p>${escapeHtml(asset.name)} · <span class="numeric ${signedClass(asset.totalReturn)}">${formatSignedCurrency(asset.totalReturn)}</span> · ${formatPercent(asset.returnRate)}</p>
            `,
            )
            .join("")}
        </article>
      `
      : emptyState("Rapor uretmek icin once varlik ve islem ekle."),
    weakAssets.length
      ? `
        <article class="stack-card">
          <strong>Yakin izleme listesi</strong>
          ${weakAssets
            .map(
              (asset) => `
              <p>${escapeHtml(asset.name)} · <span class="numeric ${signedClass(asset.totalReturn)}">${formatSignedCurrency(asset.totalReturn)}</span> · ${formatPercent(asset.returnRate)}</p>
            `,
            )
            .join("")}
        </article>
      `
      : "",
  ].join("");

  document.querySelector("#currency-report").innerHTML = Object.entries(overview.currencyExposure).length
    ? Object.entries(overview.currencyExposure)
        .sort((left, right) => right[1] - left[1])
        .map(
          ([currency, amount]) => `
          <article class="health-item">
            <div class="stack-row">
              <strong>${currency}</strong>
              <span class="numeric">${formatCurrency(amount)}</span>
            </div>
            <p class="stack-copy">Toplam varlik degerinin ${formatPercent(amount / Math.max(overview.assetsValue, 1))} kadarina denk geliyor.</p>
          </article>
        `,
        )
        .join("")
    : emptyState("Para birimi dagilimi icin once fiyatli varlik ekle.");

  document.querySelector("#health-report").innerHTML = [
    healthCard("Portfoy sayisi", String(overview.portfolioCount), "Farkli stratejileri ayri izlemek icin coklu portfoy kullanabilirsin."),
    healthCard("Acik pozisyon", String(overview.openPositions), "Hisse, fon, doviz, kiymetli maden, kripto ve BES dahil hepsi tek yerde."),
    healthCard("Nakit tamponu", formatSignedCurrency(overview.cashBalance), "Nakit hareketleri toplam degerden ayri kaybolmaz."),
    healthCard("Son kayit", formatDate(app.state.meta.lastSavedAt), "Her islemden sonra yerel olarak aninda kaydedilir."),
  ].join("");

  document.querySelector("#quality-report").innerHTML = overview.assets.length
    ? [
        overview.assetsMissingPrices
          ? healthCard(
              "Eksik fiyat",
              String(overview.assetsMissingPrices),
              "Piyasa degerlerinin dogru hesaplanmasi icin guncel fiyat girilmeli.",
            )
          : healthCard("Eksik fiyat", "0", "Tum varliklarin guncel fiyat ve kur bilgisi mevcut."),
        overview.assetsMissingFeeds
          ? healthCard(
              "Feed tanimsiz",
              String(overview.assetsMissingFeeds),
              "Otomatik fiyat yenileme icin uygun kaynak tanimlanabilir.",
            )
          : healthCard("Feed tanimsiz", "0", "Otomatik veri yenileme icin gereken tanimlar hazir."),
      ].join("")
    : emptyState("Kalite raporu icin once varlik ekle.");
}

function renderBackupStatus() {
  const snapshots = loadSnapshots();
  document.querySelector("#backup-status").innerHTML = [
    stackMetric("Otomatik kurtarma noktasi", snapshots[0] ? formatDateTime(snapshots[0].createdAt) : "Henuz yok"),
    stackMetric("Toplam kayitli snapshot", String(snapshots.length)),
    stackMetric("Yerel depolama surumu", `v${app.state.version}`),
  ].join("");
}

function renderSnapshots() {
  const snapshots = loadSnapshots();
  const container = document.querySelector("#snapshot-list");

  if (!snapshots.length) {
    container.innerHTML = emptyState("Kurtarma noktasi henuz yok.");
    return;
  }

  container.innerHTML = snapshots
    .map(
      (snapshot) => `
      <article class="snapshot-card">
        <div class="stack-row">
          <strong>${formatDateTime(snapshot.createdAt)}</strong>
          <span class="pill">${snapshot.reason}</span>
        </div>
        <p class="stack-copy">${snapshot.summary}</p>
        <div class="button-row wrap">
          <button class="secondary-button" data-restore-snapshot="${snapshot.id}">Bu yedege don</button>
          <button class="danger-button" data-delete-snapshot="${snapshot.id}">Sil</button>
        </div>
      </article>
    `,
    )
    .join("");

  container.querySelectorAll("[data-restore-snapshot]").forEach((button) => {
    button.addEventListener("click", () => restoreSnapshot(button.dataset.restoreSnapshot));
  });
  container.querySelectorAll("[data-delete-snapshot]").forEach((button) => {
    button.addEventListener("click", () => removeSnapshot(button.dataset.deleteSnapshot));
  });
}

function renderAllocation(allocation) {
  const donut = document.querySelector("#allocation-donut");
  const legend = document.querySelector("#allocation-legend");
  const entries = Object.entries(allocation).filter(([, value]) => value > 0);

  if (!entries.length) {
    donut.style.background = "radial-gradient(circle at center, var(--bg-elevated) 0 43%, transparent 44%), conic-gradient(#c7d2e1 0deg 360deg)";
    legend.innerHTML = emptyState("Dagilim olusturmak icin once fiyatli varlik ekle.");
    return;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let angle = 0;
  const segments = entries
    .map(([type, value]) => {
      const assetType = ASSET_TYPES.find((item) => item.value === type);
      const start = angle;
      const end = angle + (value / total) * 360;
      angle = end;
      return `${assetType?.color ?? "#0f8b8d"} ${start}deg ${end}deg`;
    })
    .join(", ");

  donut.style.background = `radial-gradient(circle at center, var(--bg-elevated) 0 43%, transparent 44%), conic-gradient(${segments})`;
  legend.innerHTML = entries
    .sort((left, right) => right[1] - left[1])
    .map(([type, value]) => {
      const assetType = ASSET_TYPES.find((item) => item.value === type);
      return `
        <div class="legend-item">
          <div class="button-row">
            <span class="legend-swatch" style="background:${assetType?.color ?? "#0f8b8d"}"></span>
            <strong>${assetType?.label ?? type}</strong>
          </div>
          <div>
            <div class="numeric">${formatCurrency(value)}</div>
            <div class="subtle">${formatPercent(value / total)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAssetsTable(assets) {
  if (!assets.length) {
    return emptyState("Bu filtrede gosterilecek varlik bulunamadi.");
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Varlik</th>
          <th>Portfoy</th>
          <th>Pozisyon</th>
          <th>Maliyet</th>
          <th>Guncel Deger</th>
          <th>Toplam Getiri</th>
          <th>Fiyat</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${assets
          .map(
            (asset) => `
            <tr>
              <td>
                <strong>${escapeHtml(asset.name)}</strong>
                <div class="table-subcopy">${escapeHtml(asset.symbol || typeLabel(asset.type))}</div>
              </td>
              <td>${escapeHtml(asset.portfolioName)}</td>
              <td class="numeric">${formatNumber(asset.units, asset.quantityPrecision)}</td>
              <td class="numeric">${formatCurrency(asset.costBasis)}</td>
              <td class="numeric">${formatCurrency(asset.currentValue)}</td>
              <td class="numeric ${signedClass(asset.totalReturn)}">${formatSignedCurrency(asset.totalReturn)}</td>
              <td class="numeric">${formatAssetPrice(asset)}</td>
              <td>
                <div class="table-actions">
                  <button class="secondary-button" data-edit-asset="${asset.id}">Duzenle</button>
                  <button class="danger-button" data-delete-asset="${asset.id}">Sil</button>
                </div>
              </td>
            </tr>
          `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTransactionsTable(transactions) {
  if (!transactions.length) {
    return emptyState("Islem kaydi henuz yok.");
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Tarih</th>
          <th>Tur</th>
          <th>Portfoy</th>
          <th>Varlik</th>
          <th>Detay</th>
          <th>Baz Tutar</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${transactions
          .map((transaction) => {
            const portfolio = app.state.portfolios.find((item) => item.id === transaction.portfolioId);
            const asset = app.state.assets.find((item) => item.id === transaction.assetId);
            return `
              <tr>
                <td>${formatDate(transaction.date)}</td>
                <td><span class="pill">${kindLabel(transaction.kind)}</span></td>
                <td>${escapeHtml(portfolio?.name ?? "-")}</td>
                <td>${escapeHtml(asset?.name ?? "-")}</td>
                <td>${transactionDetail(transaction)}</td>
                <td class="numeric">${formatSignedCurrency(baseImpact(transaction))}</td>
                <td>
                  <div class="table-actions">
                    <button class="secondary-button" data-edit-transaction="${transaction.id}">Duzenle</button>
                    <button class="danger-button" data-delete-transaction="${transaction.id}">Sil</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function deriveAssetsForView() {
  const assets = app.state.assets.map((asset) => deriveAsset(asset.id)).filter(Boolean);
  return assets.filter((asset) => {
    const matchesPortfolio = app.assetPortfolioFilter === "all" || asset.portfolioId === app.assetPortfolioFilter;
    const searchableText = `${asset.name} ${asset.symbol} ${asset.portfolioName} ${typeLabel(asset.type)}`.toLowerCase();
    const matchesSearch = !app.assetSearch || searchableText.includes(app.assetSearch);
    return matchesPortfolio && matchesSearch;
  });
}

function deriveTransactionsForView() {
  return [...app.state.transactions]
    .filter((transaction) => {
      const matchesKind = app.transactionKindFilter === "ALL" || transaction.kind === app.transactionKindFilter;
      const matchesPortfolio =
        app.transactionPortfolioFilter === "all" || transaction.portfolioId === app.transactionPortfolioFilter;
      return matchesKind && matchesPortfolio;
    })
    .sort((left, right) => sortByDateDesc(left.date, right.date));
}

function deriveAppOverview() {
  const portfolios = app.state.portfolios.map((portfolio) => derivePortfolio(portfolio.id));
  const assets = portfolios.flatMap((portfolio) => portfolio.assets);
  const totalValue = portfolios.reduce((sum, portfolio) => sum + portfolio.totalValue, 0);
  const totalReturn = portfolios.reduce((sum, portfolio) => sum + portfolio.totalReturn, 0);
  const cashBalance = portfolios.reduce((sum, portfolio) => sum + portfolio.cashBalance, 0);
  const netContributions = portfolios.reduce((sum, portfolio) => sum + portfolio.netContributions, 0);
  const realizedPnL = portfolios.reduce((sum, portfolio) => sum + portfolio.realizedPnL, 0);
  const unrealizedPnL = portfolios.reduce((sum, portfolio) => sum + portfolio.unrealizedPnL, 0);
  const dividends = portfolios.reduce((sum, portfolio) => sum + portfolio.dividends, 0);
  const assetsValue = portfolios.reduce((sum, portfolio) => sum + portfolio.assetsValue, 0);
  const allocation = portfolios.reduce((summary, portfolio) => mergeNumberMaps(summary, portfolio.allocation), {});
  const currencyExposure = portfolios.reduce(
    (summary, portfolio) => mergeNumberMaps(summary, portfolio.currencyExposure),
    {},
  );
  const largestPortfolio = [...portfolios].sort((left, right) => right.totalValue - left.totalValue)[0] ?? null;
  const bestAsset = [...assets].sort((left, right) => right.totalReturn - left.totalReturn)[0] ?? null;
  const worstAsset = [...assets].sort((left, right) => left.totalReturn - right.totalReturn)[0] ?? null;

  return {
    totalValue,
    totalReturn,
    cashBalance,
    netContributions,
    realizedPnL,
    unrealizedPnL,
    dividends,
    returnRate: totalReturn / Math.max(netContributions, 1),
    portfolioCount: portfolios.length,
    openPositions: assets.filter((asset) => asset.units > 0).length,
    assets,
    assetsValue,
    allocation,
    currencyExposure,
    largestPortfolio,
    bestAsset,
    worstAsset,
    assetsMissingPrices: assets.filter((asset) => !asset.currentPrice).length,
    assetsMissingFeeds: assets.filter((asset) => asset.feedType === "manual").length,
  };
}

function derivePortfolio(portfolioId) {
  const portfolio = app.state.portfolios.find((item) => item.id === portfolioId);
  if (!portfolio) {
    return null;
  }

  const assets = app.state.assets
    .filter((asset) => asset.portfolioId === portfolioId)
    .map((asset) => deriveAsset(asset.id))
    .filter(Boolean);
  const transactions = app.state.transactions.filter((transaction) => transaction.portfolioId === portfolioId);
  const netContributions = transactions.reduce((sum, transaction) => {
    if (transaction.kind === "CASH_IN") {
      return sum + transaction.amount * transaction.fxRate;
    }
    if (transaction.kind === "CASH_OUT") {
      return sum - transaction.amount * transaction.fxRate;
    }
    return sum;
  }, 0);
  const buyImpact = transactions.reduce((sum, transaction) => {
    if (transaction.kind !== "BUY") {
      return sum;
    }
    return sum + (transaction.quantity * transaction.unitPrice + transaction.fee) * transaction.fxRate;
  }, 0);
  const sellImpact = transactions.reduce((sum, transaction) => {
    if (transaction.kind !== "SELL") {
      return sum;
    }
    return sum + (transaction.quantity * transaction.unitPrice - transaction.fee) * transaction.fxRate;
  }, 0);
  const dividendImpact = transactions.reduce((sum, transaction) => {
    if (transaction.kind !== "DIVIDEND") {
      return sum;
    }
    return sum + (transaction.amount - transaction.withholding) * transaction.fxRate;
  }, 0);
  const cashBalance = netContributions + sellImpact + dividendImpact - buyImpact;
  const assetsValue = assets.reduce((sum, asset) => sum + asset.currentValue, 0);
  const realizedPnL = assets.reduce((sum, asset) => sum + asset.realizedPnL, 0);
  const unrealizedPnL = assets.reduce((sum, asset) => sum + asset.unrealizedPnL, 0);
  const dividends = assets.reduce((sum, asset) => sum + asset.dividends, 0);
  const totalValue = assetsValue + cashBalance;
  const totalReturn = totalValue - netContributions;
  const allocation = assets.reduce((summary, asset) => {
    summary[asset.type] = (summary[asset.type] ?? 0) + asset.currentValue;
    return summary;
  }, cashBalance > 0 ? { cash: cashBalance } : {});
  const currencyExposure = assets.reduce((summary, asset) => {
    summary[asset.priceCurrency] = (summary[asset.priceCurrency] ?? 0) + asset.currentValue;
    return summary;
  }, {});

  return {
    ...portfolio,
    assets,
    transactions,
    netContributions,
    cashBalance,
    assetsValue,
    realizedPnL,
    unrealizedPnL,
    dividends,
    totalValue,
    totalReturn,
    allocation,
    currencyExposure,
  };
}

function deriveAsset(assetId) {
  const asset = app.state.assets.find((item) => item.id === assetId);
  if (!asset) {
    return null;
  }

  const transactions = [...app.state.transactions]
    .filter((transaction) => transaction.assetId === assetId)
    .sort((left, right) => sortByDateAsc(left.date, right.date));

  let units = 0;
  let costBasis = 0;
  let averageCost = 0;
  let realizedPnL = 0;
  let dividends = 0;

  for (const transaction of transactions) {
    if (transaction.kind === "BUY") {
      const baseCost = (transaction.quantity * transaction.unitPrice + transaction.fee) * transaction.fxRate;
      units += transaction.quantity;
      costBasis += baseCost;
      averageCost = units > 0 ? costBasis / units : 0;
    }

    if (transaction.kind === "SELL") {
      const quantity = Math.min(transaction.quantity, units);
      const removedCost = averageCost * quantity;
      const proceeds = (transaction.quantity * transaction.unitPrice - transaction.fee) * transaction.fxRate;
      units -= quantity;
      costBasis -= removedCost;
      realizedPnL += proceeds - removedCost;
      averageCost = units > 0 ? costBasis / units : 0;
    }

    if (transaction.kind === "DIVIDEND") {
      dividends += (transaction.amount - transaction.withholding) * transaction.fxRate;
    }
  }

  const currentValue = units * asset.currentPrice * asset.currentFxRate;
  const unrealizedPnL = currentValue - costBasis;
  const totalReturn = realizedPnL + unrealizedPnL + dividends;
  const portfolio = app.state.portfolios.find((item) => item.id === asset.portfolioId);

  return {
    ...asset,
    portfolioName: portfolio?.name ?? "-",
    units,
    costBasis: clampCurrency(costBasis),
    averageCost: clampCurrency(averageCost),
    currentValue: clampCurrency(currentValue),
    unrealizedPnL: clampCurrency(unrealizedPnL),
    realizedPnL: clampCurrency(realizedPnL),
    dividends: clampCurrency(dividends),
    totalReturn: clampCurrency(totalReturn),
    returnRate: totalReturn / Math.max(costBasis, 1),
  };
}

function savePortfolioFromForm() {
  const form = document.querySelector("#portfolio-form");
  const payload = {
    id: form.elements.id.value || crypto.randomUUID(),
    name: form.elements.name.value.trim(),
    strategy: form.elements.strategy.value.trim(),
    notes: form.elements.notes.value.trim(),
  };

  if (!payload.name) {
    toast("Portfoy adi zorunlu.");
    return;
  }

  upsert("portfolios", payload);
  app.selectedPortfolioId = payload.id;
  persistState("portfolio");
  closeDialog("portfolio");
  render();
  toast("Portfoy kaydedildi.");
}

function saveAssetFromForm() {
  const form = document.querySelector("#asset-form");
  const payload = {
    id: form.elements.id.value || crypto.randomUUID(),
    portfolioId: form.elements.portfolioId.value,
    type: form.elements.type.value,
    name: form.elements.name.value.trim(),
    symbol: form.elements.symbol.value.trim().toUpperCase(),
    priceCurrency: form.elements.priceCurrency.value,
    currentPrice: Number(form.elements.currentPrice.value || 0),
    currentFxRate: Number(form.elements.currentFxRate.value || 1),
    quantityPrecision: Number(form.elements.quantityPrecision.value || 4),
    feedType: form.elements.feedType.value,
    feedUrl: form.elements.feedUrl.value.trim(),
    feedPricePath: form.elements.feedPricePath.value.trim(),
    feedFxPath: form.elements.feedFxPath.value.trim(),
    notes: form.elements.notes.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (!payload.portfolioId || !payload.name || !payload.type) {
    toast("Portfoy, ad ve varlik turu zorunlu.");
    return;
  }

  upsert("assets", payload);
  persistState("asset");
  closeDialog("asset");
  render();
  toast("Varlik kaydedildi.");
}

function saveTransactionFromForm() {
  const form = document.querySelector("#transaction-form");
  const kind = form.elements.kind.value;
  const payload = {
    id: form.elements.id.value || crypto.randomUUID(),
    portfolioId: form.elements.portfolioId.value,
    kind,
    assetId: form.elements.assetId.value || "",
    date: form.elements.date.value,
    quantity: Number(form.elements.quantity.value || 0),
    unitPrice: Number(form.elements.unitPrice.value || 0),
    amount: Number(form.elements.amount.value || 0),
    fee: Number(form.elements.fee.value || 0),
    withholding: Number(form.elements.withholding.value || 0),
    fxRate: Number(form.elements.fxRate.value || 1),
    currency: form.elements.currency.value,
    note: form.elements.note.value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (!payload.portfolioId || !payload.date) {
    toast("Portfoy ve tarih zorunlu.");
    return;
  }

  if (["BUY", "SELL", "DIVIDEND"].includes(kind) && !payload.assetId) {
    toast("Bu islem turu icin ilgili varlik secilmeli.");
    return;
  }

  if (["BUY", "SELL"].includes(kind) && (!payload.quantity || !payload.unitPrice)) {
    toast("Alim ve satis icin miktar ve birim fiyat girilmeli.");
    return;
  }

  if (["DIVIDEND", "CASH_IN", "CASH_OUT"].includes(kind) && !payload.amount) {
    toast("Bu islem turu icin tutar girilmeli.");
    return;
  }

  upsert("transactions", payload);
  persistState("transaction");
  closeDialog("transaction");
  render();
  toast("Islem kaydedildi.");
}

function deletePortfolio(portfolioId) {
  const relatedAssets = app.state.assets.filter((asset) => asset.portfolioId === portfolioId);
  const relatedTransactions = app.state.transactions.filter((transaction) => transaction.portfolioId === portfolioId);
  if (relatedAssets.length) {
    toast("Portfoyu silmeden once ilgili varliklari kaldir.");
    return;
  }
  if (relatedTransactions.length) {
    toast("Portfoyu silmeden once ilgili nakit ve diger islemleri kaldir.");
    return;
  }

  app.state.portfolios = app.state.portfolios.filter((portfolio) => portfolio.id !== portfolioId);
  if (!app.state.portfolios.length) {
    app.state.portfolios.push(createDefaultPortfolio());
  }
  app.selectedPortfolioId = app.state.portfolios[0]?.id ?? null;
  persistState("delete-portfolio");
  render();
  toast("Portfoy silindi.");
}

function deleteAsset(assetId) {
  const hasTransactions = app.state.transactions.some((transaction) => transaction.assetId === assetId);
  if (hasTransactions) {
    toast("Bu varliga bagli islemler oldugu icin once islemleri sil.");
    return;
  }
  app.state.assets = app.state.assets.filter((asset) => asset.id !== assetId);
  persistState("delete-asset");
  render();
  toast("Varlik silindi.");
}

function deleteTransaction(transactionId) {
  app.state.transactions = app.state.transactions.filter((transaction) => transaction.id !== transactionId);
  persistState("delete-transaction");
  render();
  toast("Islem silindi.");
}

function openDialog(name, entityId = "") {
  if (name === "portfolio") {
    fillPortfolioForm(entityId);
  }
  if (name === "asset") {
    fillAssetForm(entityId);
  }
  if (name === "transaction") {
    fillTransactionForm(entityId);
  }
  if (name === "backup") {
    renderSnapshots();
  }
  document.querySelector(`#${name}-dialog`).showModal();
}

function closeDialog(name) {
  document.querySelector(`#${name}-dialog`).close();
}

function fillPortfolioForm(portfolioId = "") {
  const portfolio = app.state.portfolios.find((item) => item.id === portfolioId);
  const form = document.querySelector("#portfolio-form");
  form.reset();
  form.elements.id.value = portfolio?.id ?? "";
  form.elements.name.value = portfolio?.name ?? "";
  form.elements.strategy.value = portfolio?.strategy ?? "";
  form.elements.notes.value = portfolio?.notes ?? "";
  document.querySelector("#portfolio-dialog-title").textContent = portfolio ? "Portfoy Duzenle" : "Yeni Portfoy";
}

function fillAssetForm(assetId = "") {
  const asset = app.state.assets.find((item) => item.id === assetId);
  const form = document.querySelector("#asset-form");
  form.reset();
  form.elements.id.value = asset?.id ?? "";
  form.elements.portfolioId.value = asset?.portfolioId ?? app.selectedPortfolioId ?? app.state.portfolios[0]?.id ?? "";
  form.elements.type.value = asset?.type ?? ASSET_TYPES[0].value;
  form.elements.name.value = asset?.name ?? "";
  form.elements.symbol.value = asset?.symbol ?? "";
  form.elements.priceCurrency.value = asset?.priceCurrency ?? app.state.settings.baseCurrency;
  form.elements.currentPrice.value = String(asset?.currentPrice ?? 0);
  form.elements.currentFxRate.value = String(asset?.currentFxRate ?? 1);
  form.elements.quantityPrecision.value = String(asset?.quantityPrecision ?? 4);
  form.elements.feedType.value = asset?.feedType ?? "manual";
  form.elements.feedUrl.value = asset?.feedUrl ?? "";
  form.elements.feedPricePath.value = asset?.feedPricePath ?? "";
  form.elements.feedFxPath.value = asset?.feedFxPath ?? "";
  form.elements.notes.value = asset?.notes ?? "";
  document.querySelector("#asset-dialog-title").textContent = asset ? "Varlik Duzenle" : "Yeni Varlik";
  syncAssetFeedFields();
}

function fillTransactionForm(transactionId = "") {
  const transaction = app.state.transactions.find((item) => item.id === transactionId);
  const form = document.querySelector("#transaction-form");
  form.reset();
  form.elements.id.value = transaction?.id ?? "";
  form.elements.portfolioId.value =
    transaction?.portfolioId ?? app.selectedPortfolioId ?? app.state.portfolios[0]?.id ?? "";
  hydrateAssetOptions();
  form.elements.kind.value = transaction?.kind ?? "BUY";
  form.elements.assetId.value = transaction?.assetId ?? "";
  form.elements.date.value = transaction?.date ?? todayISO();
  form.elements.quantity.value = String(transaction?.quantity ?? 0);
  form.elements.unitPrice.value = String(transaction?.unitPrice ?? 0);
  form.elements.amount.value = String(transaction?.amount ?? 0);
  form.elements.fee.value = String(transaction?.fee ?? 0);
  form.elements.withholding.value = String(transaction?.withholding ?? 0);
  form.elements.fxRate.value = String(transaction?.fxRate ?? 1);
  form.elements.currency.value = transaction?.currency ?? app.state.settings.baseCurrency;
  form.elements.note.value = transaction?.note ?? "";
  document.querySelector("#transaction-dialog-title").textContent = transaction ? "Islem Duzenle" : "Yeni Islem";
  syncTransactionFormVisibility();
}

function syncTransactionAssetOptions() {
  hydrateAssetOptions();
  syncTransactionFormVisibility();
}

function syncTransactionFormVisibility() {
  const form = document.querySelector("#transaction-form");
  const kind = form.elements.kind.value;
  const assetField = document.querySelector("#asset-select-field");
  const quantityField = form.elements.quantity.closest(".field");
  const unitPriceField = form.elements.unitPrice.closest(".field");
  const amountField = form.elements.amount.closest(".field");
  const withholdingField = form.elements.withholding.closest(".field");
  const feeField = form.elements.fee.closest(".field");

  const isTrade = kind === "BUY" || kind === "SELL";
  const isDividend = kind === "DIVIDEND";
  const isCash = kind === "CASH_IN" || kind === "CASH_OUT";

  assetField.hidden = isCash;
  quantityField.hidden = !isTrade;
  unitPriceField.hidden = !isTrade;
  amountField.hidden = isTrade;
  withholdingField.hidden = !isDividend;
  feeField.hidden = !(isTrade || isDividend);
}

function syncAssetFeedFields() {
  const form = document.querySelector("#asset-form");
  const isJson = form.elements.feedType.value === "json";
  form.elements.feedUrl.closest(".field").hidden = form.elements.feedType.value === "manual";
  form.elements.feedPricePath.closest(".field").hidden = !isJson;
  form.elements.feedFxPath.closest(".field").hidden = !isJson;
}

async function refreshMarketData({ silent = false } = {}) {
  const refreshableAssets = app.state.assets.filter((asset) => asset.feedType !== "manual");
  if (!refreshableAssets.length) {
    if (!silent) {
      toast("Otomatik veri icin en az bir varlikta feed tanimla.");
    }
    return;
  }

  let updatedCount = 0;

  for (const asset of refreshableAssets) {
    try {
      const refreshResult = await resolveMarketFeed(asset);
      if (!refreshResult) {
        continue;
      }
      asset.currentPrice = Number(refreshResult.price ?? asset.currentPrice);
      asset.currentFxRate = Number(refreshResult.fxRate ?? asset.currentFxRate);
      asset.updatedAt = new Date().toISOString();
      updatedCount += 1;
    } catch (error) {
      console.error(`Fiyat guncellenemedi: ${asset.name}`, error);
    }
  }

  if (updatedCount) {
    persistState("market-refresh");
    render();
  }

  if (!silent) {
    toast(updatedCount ? `${updatedCount} varlik fiyati guncellendi.` : "Uygun veri donmedi, fiyatlar degismedi.");
  }
}

async function resolveMarketFeed(asset) {
  if (asset.feedType === "binance" && asset.symbol) {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(asset.symbol)}`);
    if (!response.ok) {
      throw new Error("Binance yaniti alinamadi.");
    }
    const data = await response.json();
    return { price: Number(data.price), fxRate: asset.currentFxRate };
  }

  if (asset.feedType === "json" && asset.feedUrl) {
    const response = await fetch(asset.feedUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("JSON endpoint yaniti alinamadi.");
    }
    const data = await response.json();
    return {
      price: readPath(data, asset.feedPricePath),
      fxRate: asset.feedFxPath ? readPath(data, asset.feedFxPath) : asset.currentFxRate,
    };
  }

  return null;
}

function readPath(obj, path) {
  if (!path) {
    return null;
  }
  return path.split(".").reduce((value, key) => value?.[key], obj);
}

function exportState() {
  const blob = new Blob([JSON.stringify(app.state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `portfoytakip-backup-${todayISO()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast("JSON dosyasi indirildi.");
}

function importState(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      app.state = normalizeState(parsed);
      app.selectedPortfolioId = app.state.portfolios[0]?.id ?? null;
      persistState("import");
      render();
      toast("Veriler ice aktarildi.");
    } catch (error) {
      toast("JSON ice aktarma basarisiz.");
      console.error(error);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function restoreSnapshot(snapshotId) {
  const snapshot = loadSnapshots().find((item) => item.id === snapshotId);
  if (!snapshot) {
    toast("Snapshot bulunamadi.");
    return;
  }
  app.state = normalizeState(snapshot.state);
  app.selectedPortfolioId = app.state.portfolios[0]?.id ?? null;
  persistState("restore");
  render();
  toast("Yedekten geri donuldu.");
}

function removeSnapshot(snapshotId) {
  const snapshots = loadSnapshots().filter((item) => item.id !== snapshotId);
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
  renderSnapshots();
  renderBackupStatus();
  toast("Snapshot silindi.");
}

function resetAllData() {
  const accepted = window.confirm("Tum portfoy verileri silinsin mi? Bu islem geri alinamaz.");
  if (!accepted) {
    return;
  }
  app.state = createDefaultState();
  app.selectedPortfolioId = app.state.portfolios[0]?.id ?? null;
  persistState("reset");
  render();
  toast("Tum veriler sifirlandi.");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("./sw.js").catch((error) => console.error("SW kaydi basarisiz", error));
}

function cycleTheme() {
  const order = ["system", "light", "dark"];
  const currentIndex = order.indexOf(app.state.settings.theme);
  app.state.settings.theme = order[(currentIndex + 1) % order.length];
  persistState("theme");
  applyTheme();
  toast(`Tema: ${themeLabel(app.state.settings.theme)}`);
}

function applyTheme() {
  const theme = app.state.settings.theme;
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  document.body.dataset.theme = resolvedTheme;
}

function syncOnlineStatus() {
  const online = navigator.onLine;
  const network = document.querySelector("#network-status");
  const sync = document.querySelector("#sync-status");
  network.textContent = online ? "Cevrimici" : "Cevrimdisi";
  sync.textContent = online ? "Yerel onbellek hazir, senkron mimarisi aktif" : "Yerel kayit modu aktif";
  network.classList.toggle("muted", !online);
}

function persistState(reason) {
  app.state.meta.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  pushSnapshot(reason);
}

function pushSnapshot(reason) {
  const snapshots = loadSnapshots();
  const summary = `${app.state.portfolios.length} portfoy, ${app.state.assets.length} varlik, ${app.state.transactions.length} islem`;
  snapshots.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason,
    summary,
    state: app.state,
  });
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
}

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? "[]");
  } catch (error) {
    console.error("Snapshot okunamadi", error);
    return [];
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch (error) {
    console.error("Durum okunamadi, varsayilanlar yukleniyor.", error);
    return createDefaultState();
  }
}

function normalizeState(input) {
  const fallback = createDefaultState();
  return {
    version: APP_VERSION,
    portfolios: Array.isArray(input?.portfolios) && input.portfolios.length ? input.portfolios : fallback.portfolios,
    assets: Array.isArray(input?.assets) ? input.assets : [],
    transactions: Array.isArray(input?.transactions) ? input.transactions : [],
    settings: {
      baseCurrency: input?.settings?.baseCurrency ?? fallback.settings.baseCurrency,
      decimalPlaces: Number(input?.settings?.decimalPlaces ?? fallback.settings.decimalPlaces),
      compactNumbers: Boolean(input?.settings?.compactNumbers),
      autoPriceRefresh: Boolean(input?.settings?.autoPriceRefresh),
      theme: input?.settings?.theme ?? fallback.settings.theme,
    },
    meta: {
      createdAt: input?.meta?.createdAt ?? fallback.meta.createdAt,
      lastSavedAt: input?.meta?.lastSavedAt ?? fallback.meta.lastSavedAt,
    },
  };
}

function createDefaultState() {
  return {
    version: APP_VERSION,
    portfolios: [createDefaultPortfolio()],
    assets: [],
    transactions: [],
    settings: {
      baseCurrency: "TRY",
      decimalPlaces: 2,
      compactNumbers: true,
      autoPriceRefresh: false,
      theme: "system",
    },
    meta: {
      createdAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
    },
  };
}

function createDefaultPortfolio() {
  return {
    id: crypto.randomUUID(),
    name: "Ana Portfoy",
    strategy: "Uzun vadeli birikim",
    notes: "Farkli varlik siniflarini tek merkezde izlemek icin olusturuldu.",
  };
}

function upsert(collection, item) {
  const index = app.state[collection].findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    app.state[collection][index] = item;
    return;
  }
  app.state[collection].push(item);
}

function populateSelect(select, options) {
  const currentValue = select.value;
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  const hasCurrent = options.some((option) => option.value === currentValue);
  select.value = hasCurrent ? currentValue : options[0]?.value ?? "";
}

function baseImpact(transaction) {
  if (transaction.kind === "BUY") {
    return -1 * (transaction.quantity * transaction.unitPrice + transaction.fee) * transaction.fxRate;
  }
  if (transaction.kind === "SELL") {
    return (transaction.quantity * transaction.unitPrice - transaction.fee) * transaction.fxRate;
  }
  if (transaction.kind === "DIVIDEND") {
    return (transaction.amount - transaction.withholding - transaction.fee) * transaction.fxRate;
  }
  if (transaction.kind === "CASH_IN") {
    return transaction.amount * transaction.fxRate;
  }
  if (transaction.kind === "CASH_OUT") {
    return -1 * transaction.amount * transaction.fxRate;
  }
  return 0;
}

function transactionDetail(transaction) {
  if (transaction.kind === "BUY" || transaction.kind === "SELL") {
    return `
      <div class="numeric">${formatNumber(transaction.quantity, 4)} × ${formatNumber(transaction.unitPrice, 4)}</div>
      <div class="table-subcopy">Komisyon: ${formatNumber(transaction.fee, 2)} · Kur: ${formatNumber(transaction.fxRate, 4)}</div>
    `;
  }
  if (transaction.kind === "DIVIDEND") {
    return `
      <div class="numeric">${formatNumber(transaction.amount, 2)}</div>
      <div class="table-subcopy">Stopaj: ${formatNumber(transaction.withholding, 2)} · Kur: ${formatNumber(transaction.fxRate, 4)}</div>
    `;
  }
  return `
    <div class="numeric">${formatNumber(transaction.amount, 2)} ${transaction.currency}</div>
    <div class="table-subcopy">Kur: ${formatNumber(transaction.fxRate, 4)}</div>
  `;
}

function metricCard(label, value) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong class="${signedClassFromText(value)}">${value}</strong>
    </article>
  `;
}

function stackMetric(title, value, numericValue = null, helper = "") {
  return `
    <article class="stack-card">
      <div class="stack-row">
        <strong>${title}</strong>
        <span class="numeric ${numericValue === null ? "" : signedClass(numericValue)}">${value}</span>
      </div>
      ${helper ? `<p class="stack-copy">${helper}</p>` : ""}
    </article>
  `;
}

function healthCard(title, value, copy) {
  return `
    <article class="health-item">
      <div class="stack-row">
        <strong>${title}</strong>
        <span class="numeric">${value}</span>
      </div>
      <p class="stack-copy">${copy}</p>
    </article>
  `;
}

function emptyState(copy) {
  return `<div class="empty-state">${copy}</div>`;
}

function toast(message) {
  const region = document.querySelector("#toast-region");
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  region.appendChild(node);
  window.setTimeout(() => node.remove(), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: app.state.settings.baseCurrency,
    maximumFractionDigits: app.state.settings.decimalPlaces,
    notation: app.state.settings.compactNumbers && Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function formatSignedCurrency(value) {
  const abs = formatCurrency(Math.abs(value || 0));
  if (!value) {
    return abs;
  }
  return `${value > 0 ? "+" : "-"}${abs.replace(/^-/, "")}`;
}

function formatPercent(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatDateTime(dateString) {
  if (!dateString) {
    return "-";
  }
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatAssetPrice(asset) {
  return `${formatNumber(asset.currentPrice, 4)} ${asset.priceCurrency} · ${formatNumber(asset.currentFxRate, 4)}x`;
}

function typeLabel(type) {
  return ASSET_TYPES.find((item) => item.value === type)?.label ?? type;
}

function kindLabel(kind) {
  return TRANSACTION_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

function signedClass(value) {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "";
}

function signedClassFromText(value) {
  return value.startsWith("+") ? "positive" : value.startsWith("-") ? "negative" : "";
}

function clampCurrency(value) {
  return Number((value || 0).toFixed(6));
}

function mergeNumberMaps(left, right) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = (result[key] ?? 0) + value;
  }
  return result;
}

function sortByDateDesc(left, right) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function sortByDateAsc(left, right) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function themeLabel(theme) {
  if (theme === "light") {
    return "Acik";
  }
  if (theme === "dark") {
    return "Koyu";
  }
  return "Sistem";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
