const API_URL = "https://www.api.gov.uk/hmrc/individual-benefits/individual-benefits";
const TOP_LIMIT = 50;

const dimensionSelect = document.querySelector("#dimension-select");
const sortSelect = document.querySelector("#sort-select");
const refreshButton = document.querySelector("#refresh-button");
const statusEl = document.querySelector("#status");
const tableBody = document.querySelector("#results-table tbody");
const dimensionHeader = document.querySelector("#dimension-header");

let allDirectors = [];
let numericSortFields = new Map();

refreshButton.addEventListener("click", () => {
  loadData(true);
});

dimensionSelect.addEventListener("change", () => {
  renderTable();
});

sortSelect.addEventListener("change", () => {
  renderTable();
});

async function loadData(forceRefresh = false) {
  toggleLoading(true);
  statusEl.textContent = forceRefresh ? "Refreshing data from HMRC..." : "Loading data from HMRC...";
  statusEl.classList.remove("error");

  try {
    const response = await fetch(API_URL, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HMRC API request failed (${response.status})`);
    }

    const payload = await response.json();
    const dataset = extractRecords(payload);

    if (!Array.isArray(dataset) || dataset.length === 0) {
      throw new Error("HMRC API returned no usable records.");
    }

    hydrate(dataset);
    statusEl.textContent = `Showing live HMRC data fetched at ${new Date().toLocaleTimeString()}.`;
  } catch (error) {
    console.error(error);
    statusEl.textContent =
      "Unable to fetch live HMRC data. Showing a recent example dataset so you can explore the interface.";
    statusEl.classList.add("error");
    hydrate(getFallbackData());
  } finally {
    toggleLoading(false);
  }
}

function hydrate(dataset) {
  allDirectors = dataset
    .map(normaliseRecord)
    .filter((record) => record && record.isDirector)
    .sort((a, b) => b.totalBenefits - a.totalBenefits);

  populateControls(allDirectors);
  renderTable();
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?._embedded?.benefits && Array.isArray(payload._embedded.benefits)) {
    return payload._embedded.benefits;
  }
  return [];
}

function normaliseRecord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const lowerCasedKeys = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value])
  );

  const name =
    raw.name ||
    raw.fullName ||
    raw.directorName ||
    raw.employeeName ||
    lowerCasedKeys["name"] ||
    lowerCasedKeys["employee name"] ||
    null;

  const roleRaw =
    raw.role ||
    raw.position ||
    raw.jobTitle ||
    raw.employmentTitle ||
    raw.occupation ||
    lowerCasedKeys["role"] ||
    lowerCasedKeys["employment"] ||
    "";

  const isDirector = typeof roleRaw === "string" && roleRaw.toLowerCase().includes("director");

  const salary = toNumber(
    raw.salary ||
      raw.employmentIncome ||
      raw.cash ||
      raw.pay ||
      lowerCasedKeys["salary"] ||
      lowerCasedKeys["cash"]
  );

  const allowances = toNumber(
    raw.allowances ||
      raw.benefitsinKind ||
      raw.expenses ||
      lowerCasedKeys["allowances"] ||
      lowerCasedKeys["benefits"]
  );

  const totalBenefits = calculateTotalBenefits(raw, salary, allowances);

  if (!isDirector) {
    return {
      ...raw,
      isDirector,
      totalBenefits,
      salary,
      allowances,
    };
  }

  return {
    ...raw,
    displayName: name || roleRaw || "Director",
    taxNumber: raw.taxNumber || raw.taxReference || raw.nino || raw.niNumber || raw.taxId || "–",
    employeeNumber: raw.employeeNumber || raw.payrollNumber || raw.reference || raw.employeeId || "–",
    salary,
    allowances,
    totalBenefits,
    isDirector,
  };
}

function calculateTotalBenefits(record, salary, allowances) {
  const candidateFields = [
    "totalBenefits",
    "totalBenefit",
    "total",
    "benefitTotal",
    "benefits",
    "cashEquivalent",
    "cashEquivalentBenefits",
    "cashbenefit",
    "cash_value",
    "cashValue",
    "otherBenefits",
  ];

  let total = toNumber(
    candidateFields.reduce((acc, key) => acc ?? record[key], undefined)
  );

  if (Number.isFinite(total) && total > 0) {
    return total;
  }

  const numericValues = Object.values(record)
    .map(toNumber)
    .filter((value) => Number.isFinite(value));

  if (numericValues.length) {
    total = Math.max(
      salary || 0,
      allowances || 0,
      ...numericValues
    );
  }

  if (!Number.isFinite(total) || total <= 0) {
    total = (salary || 0) + (allowances || 0);
  }

  return total;
}

function populateControls(records) {
  if (!records.length) {
    dimensionSelect.innerHTML = "";
    sortSelect.innerHTML = "";
    return;
  }

  const sample = records[0];
  const fieldCandidates = Object.keys(sample)
    .filter((key) => !key.startsWith("_"))
    .filter((key) => typeof sample[key] === "string" || typeof sample[key] === "number")
    .filter((key) => !["isDirector", "totalBenefits"].includes(key));

  const dimensionOptions = new Map();
  fieldCandidates.forEach((key) => dimensionOptions.set(key, toLabel(key)));

  const existingDimension = dimensionSelect.value;
  dimensionSelect.innerHTML = "";
  for (const [value, label] of dimensionOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    dimensionSelect.append(option);
  }

  if (dimensionOptions.has(existingDimension)) {
    dimensionSelect.value = existingDimension;
  } else if (dimensionOptions.has("displayName")) {
    dimensionSelect.value = "displayName";
  } else {
    dimensionSelect.selectedIndex = 0;
  }

  numericSortFields = new Map([
    ["totalBenefits", "Total benefits"],
  ]);

  const numericKeys = fieldCandidates.filter((key) => Number.isFinite(toNumber(sample[key])));
  numericKeys.forEach((key) => {
    if (!numericSortFields.has(key)) {
      numericSortFields.set(key, toLabel(key));
    }
  });

  const existingSort = sortSelect.value;
  sortSelect.innerHTML = "";
  for (const [value, label] of numericSortFields.entries()) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sortSelect.append(option);
  }

  if (numericSortFields.has(existingSort)) {
    sortSelect.value = existingSort;
  } else {
    sortSelect.value = "totalBenefits";
  }

  dimensionHeader.textContent = dimensionSelect.options[dimensionSelect.selectedIndex]?.textContent ?? "Director";
}

function renderTable() {
  if (!allDirectors.length) {
    tableBody.innerHTML = "";
    return;
  }

  const dimensionField = dimensionSelect.value || "displayName";
  const sortField = sortSelect.value || "totalBenefits";

  dimensionHeader.textContent = dimensionSelect.options[dimensionSelect.selectedIndex]?.textContent ?? "Director";

  const sorted = [...allDirectors].sort((a, b) => {
    const valueA = toNumber(a[sortField]);
    const valueB = toNumber(b[sortField]);

    if (Number.isFinite(valueA) && Number.isFinite(valueB)) {
      return valueB - valueA;
    }

    const strA = formatValue(a[sortField]).toString().toLowerCase();
    const strB = formatValue(b[sortField]).toString().toLowerCase();
    return strA.localeCompare(strB);
  });

  const rows = sorted.slice(0, TOP_LIMIT).map((record, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="rank-col">${index + 1}</td>
      <td>${formatValue(record[dimensionField] ?? record.displayName)}</td>
      <td class="numeric">${formatCurrency(record.totalBenefits)}</td>
      <td class="numeric">${formatCurrency(record.salary)}</td>
      <td class="numeric">${formatCurrency(record.allowances)}</td>
      <td>${formatValue(record.taxNumber)}</td>
      <td>${formatValue(record.employeeNumber)}</td>
    `;

    return row;
  });

  tableBody.replaceChildren(...rows);
}

function formatCurrency(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number === 0) return "–";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(number);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  return value;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const clean = value.replace(/[^0-9.-]+/g, "");
    const parsed = Number.parseFloat(clean);
    return Number.isNaN(parsed) ? NaN : parsed;
  }
  return NaN;
}

function toLabel(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function toggleLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "Loading..." : "Refresh data";
}

function getFallbackData() {
  return [
    {
      displayName: "Amelia Clarke",
      role: "Executive Director",
      salary: 325000,
      allowances: 58000,
      totalBenefits: 412000,
      taxNumber: "TN-102938",
      employeeNumber: "EMP-8821",
      taxReference: "TN-102938",
      employeeId: "EMP-8821",
    },
    {
      displayName: "Oliver Patel",
      role: "Finance Director",
      salary: 298000,
      allowances: 75000,
      totalBenefits: 395000,
      taxNumber: "TN-435261",
      employeeNumber: "EMP-7712",
    },
    {
      displayName: "Sophia Ahmed",
      role: "Operations Director",
      salary: 287000,
      allowances: 64000,
      totalBenefits: 365000,
      taxNumber: "TN-994311",
      employeeNumber: "EMP-6631",
    },
    {
      displayName: "Ethan Walker",
      role: "Managing Director",
      salary: 342000,
      allowances: 52000,
      totalBenefits: 362000,
      taxNumber: "TN-884562",
      employeeNumber: "EMP-5520",
    },
    {
      displayName: "Charlotte Green",
      role: "Commercial Director",
      salary: 271000,
      allowances: 71000,
      totalBenefits: 349000,
      taxNumber: "TN-773215",
      employeeNumber: "EMP-4419",
    },
  ];
}

loadData();
