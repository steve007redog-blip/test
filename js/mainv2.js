// ================================
// SUPPLIERS + EMAILS (HARDCODED)
// ================================
const SUPPLIERS = {
    "DIC": ["DICNZ.CustomerServices@dic.co.nz"],
    "DKSH": ["rick.menalda@dksh.com", "Sales.pM.NZ@dksh.com"],
    "Packaging Products": ["sales@packprod.co.nz"],
    "Miscellaneous": ["oggiowens@outlook.com"]
};

const CC_RECIPIENTS = [
    "iris@lamprint.co.nz",
    "todd@lamprint.co.nz"
];
/* ============================================================
   GLOBALS
============================================================ */
/* ============================================================
   GLOBALS
============================================================ */

// your globals here…

// ================================
// SUPPLIER DROPDOWN FUNCTION
// ================================
function populateSupplierDropdown() {
    const supplierSelect = document.getElementById("supplier");
    supplierSelect.innerHTML = "";

    Object.keys(SUPPLIERS).forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        supplierSelect.appendChild(opt);
    });
}

let db = null;
let isEditing = false;
let currentOrderNumber = "";

let inkData = []; // Loaded from inkcodes.json

// Codes treated as solvents
const SOLVENT_CODES = ["Acetol", "Ethyl", "Normal", "Lactanol"];

/* ============================================================
   ON PAGE LOAD
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    init();
});

/* ============================================================
   INIT
============================================================ */
async function init() {
    await openDB();
    await loadInkCodes();
    populateSupplierDropdown();
    await loadOrderNumber();
    autoFillDate();
    setupButtons();
}

/* ============================================================
   LOAD INK CODES (inkcodes.json)
============================================================ */
async function loadInkCodes() {
    try {
        const response = await fetch("inkcodes.json");
        if (!response.ok) {
            console.error("Failed to load inkcodes.json");
            return;
        }
        inkData = await response.json();
    } catch (err) {
        console.error("Error loading inkcodes.json:", err);
    }
}

/* ============================================================
   INDEXEDDB SETUP
============================================================ */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("LamprintOrdersDB", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("orders")) {
                const store = db.createObjectStore("orders", { keyPath: "number" });
                store.createIndex("number", "number", { unique: true });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };
    });
}

function getAllOrders() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("orders", "readonly");
        const store = tx.objectStore("orders");
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

function getOrderByNumber(number) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("orders", "readonly");
        const store = tx.objectStore("orders");
        const request = store.get(number);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function saveOrderToDB(order) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("orders", "readwrite");
        const store = tx.objectStore("orders");
        const request = store.put(order);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* ============================================================
   AUTO-FILL DATE
============================================================ */
function autoFillDate() {
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("orderDate").value = today;
}

/* ============================================================
   SUPPLIER DROPDOWN
============================================================ */
function populateSuppliers() {
    const select = document.getElementById("supplier");
    select.innerHTML = "";

    Object.keys(SUPPLIERS).forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

/* ============================================================
   GENERATE NEXT ORDER NUMBER
============================================================ */
async function generateNextOrderNumber() {
    const orders = await getAllOrders();
    if (orders.length === 0) return "LAM001";

    let maxNum = 0;
    orders.forEach(o => {
        const n = parseInt(String(o.number).replace("LAM", ""), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
    });

    return "LAM" + (maxNum + 1).toString().padStart(3, "0");
}

/* ============================================================
   LOAD ORDER NUMBER (NEW OR EDIT)
============================================================ */
async function loadOrderNumber() {
    const editNumber = localStorage.getItem("editOrderNumber");

    if (editNumber) {
        isEditing = true;
        await loadOrderForEditing(editNumber);
        localStorage.removeItem("editOrderNumber");
    } else {
        isEditing = false;
        currentOrderNumber = await generateNextOrderNumber();
        document.getElementById("orderNumber").value = currentOrderNumber;
    }
}

/* ============================================================
   SETUP BUTTONS
============================================================ */
function setupButtons() {
    document.getElementById("addItemRow").addEventListener("click", addItemRow);
    document.getElementById("clearItems").addEventListener("click", clearAllItems);
    document.getElementById("saveOrder").addEventListener("click", () => {
        saveOrder().catch(err => {
            console.error("Error saving order:", err);
            alert("Error saving order.");
        });
    });

    document.getElementById("sendEmail").addEventListener("click", sendEmail);
}

/* ============================================================
   ITEM ROWS WITH TYPE + CODE DROPDOWNS
============================================================ */
function addItemRow() {
    const tbody = document.getElementById("itemsBody");

    const row = document.createElement("tr");
    row.innerHTML = `
        <td>
            <select class="item-type form-control">
                <option value="">Type</option>
                <option value="Ink">Ink</option>
                <option value="Solvent">Solvent</option>
                <option value="Tape">Tape</option>
                <option value="Boxes">Boxes</option>
                <option value="Cores">Cores</option>
                <option value="Other">Other</option>
            </select>
        </td>
        <td>
            <select class="item-code-select form-control" style="display:none;"></select>
            <input type="text" class="item-code-text form-control">
        </td>
        <td><input type="text" class="item-desc form-control"></td>
        <td><input type="number" class="item-qty form-control" min="1" value="1"></td>
        <td><input type="date" class="item-date form-control"></td>
        <td><button class="btn btn-danger remove-row">X</button></td>
    `;

    const typeSelect = row.querySelector(".item-type");
    const codeSelect = row.querySelector(".item-code-select");
    const codeText = row.querySelector(".item-code-text");
    const descInput = row.querySelector(".item-desc");

    row.querySelector(".remove-row").addEventListener("click", () => row.remove());

    typeSelect.addEventListener("change", () => handleItemTypeChange(row));
    codeSelect.addEventListener("change", () => handleCodeChange(row));

    // Default: manual code/description
    descInput.readOnly = false;
    codeSelect.style.display = "none";
    codeText.style.display = "block";

    tbody.appendChild(row);
}

/* Handle item type change: auto supplier + dropdown behaviour */
function handleItemTypeChange(row) {
    const typeSelect = row.querySelector(".item-type");
    const codeSelect = row.querySelector(".item-code-select");
    const codeText = row.querySelector(".item-code-text");
    const descInput = row.querySelector(".item-desc");
    const supplierSelect = document.getElementById("supplier");

    const type = typeSelect.value;

    if (type === "Ink") {
        // Auto supplier: DIC
        supplierSelect.value = "DIC";

        // Use dropdown for codes
        codeSelect.style.display = "block";
        codeText.style.display = "none";
        descInput.readOnly = true;

        populateCodeDropdown(row, "Ink");
    } else if (type === "Solvent") {
        // Auto supplier: DKSH
        supplierSelect.value = "DKSH";

        codeSelect.style.display = "block";
        codeText.style.display = "none";
        descInput.readOnly = true;

        populateCodeDropdown(row, "Solvent");
    } else if (type === "Tape" || type === "Boxes" || type === "Cores" || type === "Other") {
        // Auto supplier: Miscellaneous
        supplierSelect.value = "Miscellaneous";

        // Manual entry
        codeSelect.style.display = "none";
        codeText.style.display = "block";
        descInput.readOnly = false;

        codeSelect.innerHTML = "";
        descInput.value = "";
    } else {
        // No type selected
        codeSelect.style.display = "none";
        codeText.style.display = "block";
        descInput.readOnly = false;
        descInput.value = "";
    }
}

/* Populate code dropdown based on type (Ink / Solvent) */
function populateCodeDropdown(row, type) {
    const codeSelect = row.querySelector(".item-code-select");
    const descInput = row.querySelector(".item-desc");

    codeSelect.innerHTML = "";

    let filtered = [];

    if (type === "Ink") {
        filtered = inkData.filter(item => !SOLVENT_CODES.includes(item.code));
    } else if (type === "Solvent") {
        filtered = inkData.filter(item => SOLVENT_CODES.includes(item.code));
    }

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Select code";
    codeSelect.appendChild(defaultOpt);

    filtered.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.code;
        opt.textContent = `${item.code} - ${item.name}`;
        codeSelect.appendChild(opt);
    });

    descInput.value = "";
}

/* When code changes, auto-fill description */
function handleCodeChange(row) {
    const codeSelect = row.querySelector(".item-code-select");
    const descInput = row.querySelector(".item-desc");

    const code = codeSelect.value;
    const found = inkData.find(item => item.code === code);

    if (found) {
        descInput.value = found.name;
    } else {
        descInput.value = "";
    }
}

/* ============================================================
   CLEAR ALL ITEMS
============================================================ */
function clearAllItems() {
    document.getElementById("itemsBody").innerHTML = "";
}

/* ============================================================
   SAVE ORDER
============================================================ */
async function saveOrder() {
    const number = document.getElementById("orderNumber").value;
    const date = document.getElementById("orderDate").value;
    const supplier = document.getElementById("supplier").value;
    const status = document.getElementById("orderStatus").value;
    const comments = document.getElementById("orderComments").value;

    const items = [];
    document.querySelectorAll("#itemsBody tr").forEach(row => {
        const type = row.querySelector(".item-type").value;
        const codeSelect = row.querySelector(".item-code-select");
        const codeText = row.querySelector(".item-code-text");
        const desc = row.querySelector(".item-desc").value.trim();
        const qty = row.querySelector(".item-qty").value.trim();
        const expected = row.querySelector(".item-date").value;

        let code = "";
        if (codeSelect.style.display === "block") {
            code = codeSelect.value;
        } else {
            code = codeText.value.trim();
        }

        if (type || code || desc || qty || expected) {
            items.push({ itemType: type, code, description: desc, qty, expected });
        }
    });

    const order = { number, date, supplier, status, comments, items };

    await saveOrderToDB(order);

    alert(isEditing ? "Order updated." : "Order saved.");

    if (!isEditing) {
        clearAllItems();
        document.getElementById("orderComments").value = "";
        document.getElementById("orderStatus").value = "Pending";
        document.getElementById("supplier").value = "Miscellaneous";

        const next = await generateNextOrderNumber();
        currentOrderNumber = next;
        document.getElementById("orderNumber").value = next;
    }
}

/* ============================================================
   LOAD ORDER FOR EDITING
============================================================ */
async function loadOrderForEditing(orderNumber) {
    const order = await getOrderByNumber(orderNumber);
    if (!order) return;

    isEditing = true;
    currentOrderNumber = order.number;

    document.getElementById("orderNumber").value = order.number;
    document.getElementById("orderDate").value = order.date;
    document.getElementById("supplier").value = order.supplier;
    document.getElementById("orderStatus").value = order.status;
    document.getElementById("orderComments").value = order.comments;

    clearAllItems();

    order.items.forEach(item => {
        addItemRow();
        const row = document.querySelector("#itemsBody tr:last-child");

        const typeSelect = row.querySelector(".item-type");
        const codeSelect = row.querySelector(".item-code-select");
        const codeText = row.querySelector(".item-code-text");
        const descInput = row.querySelector(".item-desc");

        typeSelect.value = item.itemType || "";
        handleItemTypeChange(row);

        if (typeSelect.value === "Ink" || typeSelect.value === "Solvent") {
            // Try to match code in dropdown
            populateCodeDropdown(row, typeSelect.value);
            const option = Array.from(codeSelect.options).find(opt => opt.value === item.code);
            if (option) {
                codeSelect.value = item.code;
                handleCodeChange(row);
            } else {
                // Fallback to manual
                codeSelect.style.display = "none";
                codeText.style.display = "block";
                descInput.readOnly = false;
                codeText.value = item.code || "";
                descInput.value = item.description || "";
            }
        } else {
            codeSelect.style.display = "none";
            codeText.style.display = "block";
            descInput.readOnly = false;
            codeText.value = item.code || "";
            descInput.value = item.description || "";
        }

        row.querySelector(".item-qty").value = item.qty || "";
        row.querySelector(".item-date").value = item.expected || "";
    });
}

/* ============================================================
   SEND EMAIL (WITH CC)
============================================================ */
function sendEmail() {
    const supplierName = document.getElementById("supplier").value;
    const recipients = SUPPLIERS[supplierName] || ["oggiowens@outlook.com"];

    const ccRecipients = [
        "iris@lamprint.co.nz",
        "todd@lamprint.co.nz"
    ];

    const orderNumber = document.getElementById("orderNumber").value;
    const date = document.getElementById("orderDate").value;
    const status = document.getElementById("orderStatus").value;
    const comments = document.getElementById("orderComments").value;

    let body = "";
    body += `Order Number: ${orderNumber}\n`;
    body += `Date: ${date}\n`;
    body += `Supplier: ${supplierName}\n`;
    body += `Status: ${status}\n\n`;
    body += `Comments:\n${comments}\n\n`;
    body += `Items:\n`;

    document.querySelectorAll("#itemsBody tr").forEach(row => {
        const type = row.querySelector(".item-type").value;
        const codeSelect = row.querySelector(".item-code-select");
        const codeText = row.querySelector(".item-code-text");
        const desc = row.querySelector(".item-desc").value;
        const qty = row.querySelector(".item-qty").value;
        const expected = row.querySelector(".item-date").value;

        let code = "";
        if (codeSelect.style.display === "block") {
            code = codeSelect.value;
        } else {
            code = codeText.value;
        }

        body += `- ${type} | ${code} | ${desc} | Qty: ${qty} | Expected: ${expected}\n`;
    });

    body += `\n\nRegards,\n`;
    body += `Steve Owens\n`;
    body += `Lamprint Packaging\n`;
    body += `https://www.lamprint.co.nz/\n`;

    const toField = recipients.join(",");
    const ccField = ccRecipients.join(",");

    const mailto = `mailto:${toField}?cc=${encodeURIComponent(ccField)}&subject=Order%20${orderNumber}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
}
