import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from "./firebase";
import {
  collection, addDoc, updateDoc, doc, setDoc, onSnapshot,
  deleteDoc, query, where, getDocs
} from "firebase/firestore";
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── helpers ──────────────────────────────────────────────────────────────────
const toNum = v => Number(typeof v === 'string' ? v.replace(/,/g, '') : v) || 0;

const inRange = (list, from, to) => {
  if (!from || !to) return list;
  const a = new Date(from);
  const b = new Date(to); b.setHours(23, 59, 59, 999);
  return list.filter(t => { const d = new Date(t.date); return d >= a && d <= b; });
};

// ─── styles ───────────────────────────────────────────────────────────────────
const S = {
  redBtn: {
    padding: '7px 20px', background: '#c0392b', color: '#fff',
    border: 'none', borderRadius: 4, fontWeight: 'bold',
    cursor: 'pointer', fontSize: 13
  },
  filterBar: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    gap: 10, margin: '18px 0 10px', padding: '12px 14px',
    background: '#f8f9fa', borderRadius: 6, border: '1px solid #ddd'
  },
  delBtn: {
    padding: '10px 16px', 
    fontSize: 14, 
    color: '#fff',
    background: '#c0392b', 
    border: '2px solid #922b21',
    borderRadius: 5,
    cursor: 'pointer', 
    fontWeight: 'bold',
    display: 'inline-block',
    minWidth: '120px',
    textAlign: 'center',
    whiteSpace: 'nowrap'
  },
  editBtn: {
    padding: '10px 16px', 
    fontSize: 14, 
    color: '#fff',
    background: '#0069d9', 
    border: '2px solid #004085',
    borderRadius: 5,
    cursor: 'pointer', 
    fontWeight: 'bold',
    display: 'inline-block',
    minWidth: '120px',
    textAlign: 'center',
    whiteSpace: 'nowrap'
  },
  commentBtn: {
    padding: '10px 16px', 
    fontSize: 14, 
    color: '#fff',
    background: '#6c757d', 
    border: '2px solid #545b62',
    borderRadius: 5,
    cursor: 'pointer', 
    fontWeight: 'bold',
    display: 'inline-block',
    minWidth: '120px',
    textAlign: 'center',
    whiteSpace: 'nowrap'
  }
};

// ─── PDF helper ───────────────────────────────────────────────────────────────
function makePDF(title, filename, head, body) {
  const doc = new jsPDF();
  doc.setFontSize(15);
  doc.text(title, 14, 16);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text('Generated: ' + new Date().toLocaleDateString('en-IN'), 14, 23);
  doc.setTextColor(0);
  doc.autoTable({
    startY: 28, head: [head], body,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 249, 255] },
    styles: { fontSize: 10, cellPadding: 4 }
  });
  const lastIdx = head.length - 1;
  if (head[lastIdx] === 'Amount') {
    const total = body.reduce((s, r) => s + toNum(String(r[lastIdx]).replace('₹', '')), 0);
    const y = (doc.lastAutoTable?.finalY ?? 30) + 8;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Total: ₹' + total.toFixed(2), 196, y, { align: 'right' });
  }
  doc.save(filename);
}

// ─── CommentModal ─────────────────────────────────────────────────────────────
function CommentModal({ tx, onClose }) {
  if (!tx) return null;
  return (
    <div className="modal">
      <div style={{ maxWidth: 420, minWidth: 280, margin: 'auto', background: '#fff', border: '1px solid #bbb', borderRadius: 6, padding: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Transaction Details</h3>
        <p><b>Type:</b> {tx.type}</p>
        <p><b>Date:</b> {tx.date}</p>
        <p><b>Party:</b> {tx.party}</p>
        <p><b>Amount:</b> ₹{toNum(tx.amount).toFixed(2)}</p>
        {tx.billNumber && <p><b>Bill No:</b> {tx.billNumber}</p>}
        {tx.method && <p><b>Method:</b> {tx.method}</p>}
        {tx.checkNumber && <p><b>Check No:</b> {tx.checkNumber}</p>}
        <p><b>Comment:</b> {tx.comment || <span style={{ color: '#999' }}>No comment.</span>}</p>
        <button onClick={onClose} style={{ marginTop: 14 }}>Close</button>
      </div>
    </div>
  );
}

// ─── PartyTable ───────────────────────────────────────────────────────────────
function PartyTable({ parties, onDelete }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER = 7;
  const filtered = parties.filter(p =>
    [p.businessName, p.contactName, p.phoneNumber, p.contactMobile]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase()))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const shown = filtered.slice((page - 1) * PER, page * PER);
  return (
    <div>
      <input placeholder="Search party..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: '100%', padding: 5, marginBottom: 8 }} />
      <div style={{ overflowX: 'auto' }}>
        <table className="transaction-table">
          <thead><tr>
            <th>Business</th><th>Phone</th><th>Bank No</th>
            <th>Bank Name</th><th>Contact</th><th>Mobile</th><th>Delete</th>
          </tr></thead>
          <tbody>
            {shown.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>No parties.</td></tr>
              : shown.map((p, i) => (
                <tr key={i}>
                  <td>{p.businessName}</td><td>{p.phoneNumber}</td>
                  <td>{p.bankNumber}</td><td>{p.bankName}</td>
                  <td>{p.contactName}</td><td>{p.contactMobile}</td>
                  <td>
                    <button style={S.delBtn} onClick={() => onDelete(p)}>🗑 Delete</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        Page {page}/{pages}
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ marginLeft: 8 }}>Prev</button>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ marginLeft: 6 }}>Next</button>
      </div>
    </div>
  );
}

// ─── TxTable (ALL TRANSACTIONS - Compact) ─────────
function TxTable({ transactions, onEdit, onComment, onDelete }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // running balance per party
  const balMap = {};
  const byParty = {};
  transactions.forEach(tx => { (byParty[tx.party] = byParty[tx.party] || []).push(tx); });
  Object.values(byParty).forEach(list => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    list.forEach(tx => {
      if (tx.type === 'purchase') bal += toNum(tx.amount);
      else bal -= toNum(tx.amount);
      balMap[tx.id] = bal;
    });
  });

  return (
    <div style={{ overflowX: 'auto', marginTop: 16, width: '100%' }}>
      <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Type</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Amount</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Balance</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Edit</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Comment</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0
            ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: 20 }}>No transactions found.</td></tr>
            : sorted.map((tx, i) => {
              const isPurchase = tx.type === 'purchase';
              const isPayRet   = tx.type === 'payment' || tx.type === 'return';
              return (
                <tr key={tx.id || i} style={{ fontSize: '12px' }}>
                  <td style={{ padding: '4px 6px' }}>{tx.date}</td>
                  <td style={{ padding: '4px 6px' }}>{tx.party}</td>
                  <td style={{ padding: '4px 6px', textTransform: 'capitalize' }}>{tx.type}</td>
                  <td style={{ padding: '4px 6px' }}>₹{toNum(tx.amount).toFixed(2)}</td>
                  <td style={{ padding: '4px 6px' }}>₹{balMap[tx.id] !== undefined ? toNum(balMap[tx.id]).toFixed(2) : '-'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <button style={S.editBtn} onClick={() => onEdit && onEdit(tx)}>✏ Edit</button>
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <button style={S.delBtn} onClick={() => onDelete && onDelete(tx)}>🗑 Delete</button>
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    {tx.comment
                      ? <button style={S.commentBtn} onClick={() => onComment && onComment(tx)}>💬</button>
                      : '-'}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ─── PURCHASE TRANSACTION TABLE (Compact) ─────
function PurchaseTransactionTable({ transactions, onEdit, onComment, onDelete }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ overflowX: 'auto', marginTop: 16, width: '100%' }}>
      <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Bill No</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Amount</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Edit</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Comment</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0
            ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888', padding: 20 }}>No purchase transactions found.</td></tr>
            : sorted.map((tx, i) => (
              <tr key={tx.id || i} style={{ fontSize: '12px' }}>
                <td style={{ padding: '4px 6px' }}>{tx.date}</td>
                <td style={{ padding: '4px 6px' }}>{tx.party}</td>
                <td style={{ padding: '4px 6px' }}>{tx.billNumber || '-'}</td>
                <td style={{ padding: '4px 6px' }}>₹{toNum(tx.amount).toFixed(2)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.editBtn} onClick={() => onEdit && onEdit(tx)}>✏ Edit</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.delBtn} onClick={() => onDelete && onDelete(tx)}>🗑 Delete</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  {tx.comment
                    ? <button style={S.commentBtn} onClick={() => onComment && onComment(tx)}>💬</button>
                    : '-'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── PAYMENT TRANSACTION TABLE (Compact) ─────
function PaymentTransactionTable({ transactions, onEdit, onComment, onDelete }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ overflowX: 'auto', marginTop: 16, width: '100%' }}>
      <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Method</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Check No</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Amount</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Edit</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Comment</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0
            ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: 20 }}>No payment transactions found.</td></tr>
            : sorted.map((tx, i) => (
              <tr key={tx.id || i} style={{ fontSize: '12px' }}>
                <td style={{ padding: '4px 6px' }}>{tx.date}</td>
                <td style={{ padding: '4px 6px' }}>{tx.party}</td>
                <td style={{ padding: '4px 6px' }}>{tx.method || '-'}</td>
                <td style={{ padding: '4px 6px' }}>{tx.checkNumber || '-'}</td>
                <td style={{ padding: '4px 6px', color: '#27ae60' }}>₹{toNum(tx.amount).toFixed(2)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.editBtn} onClick={() => onEdit && onEdit(tx)}>✏ Edit</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.delBtn} onClick={() => onDelete && onDelete(tx)}>🗑 Delete</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  {tx.comment
                    ? <button style={S.commentBtn} onClick={() => onComment && onComment(tx)}>💬</button>
                    : '-'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── RETURN TRANSACTION TABLE (Compact) ─────
function ReturnTransactionTable({ transactions, onEdit, onComment, onDelete }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ overflowX: 'auto', marginTop: 16, width: '100%' }}>
      <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Amount</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Edit</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0
            ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: 20 }}>No return transactions found.</td></tr>
            : sorted.map((tx, i) => (
              <tr key={tx.id || i} style={{ fontSize: '12px' }}>
                <td style={{ padding: '4px 6px' }}>{tx.date}</td>
                <td style={{ padding: '4px 6px' }}>{tx.party}</td>
                <td style={{ padding: '4px 6px', color: '#c0392b' }}>₹{toNum(tx.amount).toFixed(2)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.editBtn} onClick={() => onEdit && onEdit(tx)}>✏ Edit</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.delBtn} onClick={() => onDelete && onDelete(tx)}>🗑 Delete</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  {tx.comment
                    ? <button style={S.commentBtn} onClick={() => onComment && onComment(tx)}>💬</button>
                    : '-'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── BALANCE TRANSACTION TABLE (Compact) ─────
function BalanceTransactionTable({ transactions, onEdit, onComment, onDelete }) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Calculate running balance
  const balMap = {};
  const byParty = {};
  transactions.forEach(tx => { (byParty[tx.party] = byParty[tx.party] || []).push(tx); });
  Object.values(byParty).forEach(list => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    list.forEach(tx => {
      if (tx.type === 'purchase') bal += toNum(tx.amount);
      else bal -= toNum(tx.amount);
      balMap[tx.id] = bal;
    });
  });

  return (
    <div style={{ overflowX: 'auto', marginTop: 16, width: '100%' }}>
      <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Type</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Amount</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Balance</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Edit</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
            <th style={{ fontSize: '12px', padding: '6px' }}>Comment</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0
            ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: 20 }}>No transactions found.</td></tr>
            : sorted.map((tx, i) => (
              <tr key={tx.id || i} style={{ fontSize: '12px' }}>
                <td style={{ padding: '4px 6px' }}>{tx.date}</td>
                <td style={{ padding: '4px 6px' }}>{tx.party}</td>
                <td style={{ padding: '4px 6px', textTransform: 'capitalize' }}>{tx.type}</td>
                <td style={{ padding: '4px 6px' }}>₹{toNum(tx.amount).toFixed(2)}</td>
                <td style={{ padding: '4px 6px' }}>₹{balMap[tx.id] !== undefined ? toNum(balMap[tx.id]).toFixed(2) : '-'}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.editBtn} onClick={() => onEdit && onEdit(tx)}>✏ Edit</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <button style={S.delBtn} onClick={() => onDelete && onDelete(tx)}>🗑 Delete</button>
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  {tx.comment
                    ? <button style={S.commentBtn} onClick={() => onComment && onComment(tx)}>💬</button>
                    : '-'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── DateFilter bar ───────────────────────────────────────────────────────────
function DateFilter({ from, setFrom, to, setTo, label, onExport }) {
  return (
    <div style={S.filterBar}>
      <strong>{label}</strong>
      <label>From: <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>To: <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button style={S.redBtn} onClick={onExport}>📄 Export PDF</button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [view, setView] = useState('home');
  const [selectedParty, setSelectedParty] = useState('');

  // firestore data
  const [purchases, setPurchases]   = useState([]);
  const [payments,  setPayments]    = useState([]);
  const [returns,   setReturns]     = useState([]);
  const [deposits,  setDeposits]    = useState([]);
  const [parties,   setParties]     = useState([]);
  const [bankBal,   setBankBal]     = useState(0);

  // forms
  const emptyForm = {
    amount: '', billNumber: '', date: '', payment: '', paymentMethod: '',
    returnAmount: '', returnDate: '', checkNumber: '', comment: '',
    depositAmount: '', depositDate: ''
  };
  const [form,      setForm]        = useState(emptyForm);
  const [partyForm, setPartyForm]   = useState({ businessName: '', phoneNumber: '', bankNumber: '', bankName: '', contactName: '', contactMobile: '' });
  const [showPartyForm, setShowPartyForm] = useState(false);

  // modals
  const [editTx,    setEditTx]      = useState(null);
  const [editForm,  setEditForm]    = useState({});
  const [commentTx, setCommentTx]   = useState(null);

  // export date ranges
  const [homeFrom, setHomeFrom] = useState(''); const [homeTo, setHomeTo] = useState('');
  const [pFrom,    setPFrom]    = useState(''); const [pTo,    setPTo]    = useState('');
  const [payFrom,  setPayFrom]  = useState(''); const [payTo,  setPayTo]  = useState('');
  const [rFrom,    setRFrom]    = useState(''); const [rTo,    setRTo]    = useState('');
  const [bFrom,    setBFrom]    = useState(''); const [bTo,    setBTo]    = useState('');

  // ── listeners ──
  useEffect(() => {
    const u = [
      onSnapshot(collection(db, 'parties'),      s => setParties(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'purchases'),    s => setPurchases(s.docs.map(d => ({ id: d.id, type: 'purchase', ...d.data() })))),
      onSnapshot(collection(db, 'payments'),     s => setPayments(s.docs.map(d => ({ id: d.id, type: 'payment',  ...d.data() })))),
      onSnapshot(collection(db, 'returns'),      s => setReturns(s.docs.map(d => ({ id: d.id, type: 'return',   ...d.data() })))),
      onSnapshot(collection(db, 'bankDeposits'), s => setDeposits(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, 'meta', 'bank'),        snap => setBankBal(snap.exists() ? snap.data().balance || 0 : 0)),
    ];
    return () => u.forEach(fn => fn());
  }, []);

  // ── derived ──
  const allTx      = [...purchases, ...payments, ...returns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const filteredTx = selectedParty ? allTx.filter(t => t.party === selectedParty) : allTx;
  const totalOwed  = filteredTx.reduce((s, t) => t.type === 'purchase' ? s + toNum(t.amount) : s - toNum(t.amount), 0);

  // ── bank ledger ──
  const getBankLedger = () => {
    const ledger = [];
    deposits.filter(d => d.isPaymentDeduction !== true).forEach(d => ledger.push({
      id: d.id, date: d.date, party: d.party || '-', method: 'Deposit', checkNumber: '-',
      debit:  d.amount < 0 ? Math.abs(toNum(d.amount)) : null,
      credit: d.amount > 0 ? toNum(d.amount) : null,
      type: 'deposit', source: 'bankDeposits', isPaymentDeduction: false
    }));
    payments.filter(p => p.method === 'NEFT' || p.method === 'Check').forEach(p => ledger.push({
      id: p.id, date: p.date, party: p.party, method: p.method,
      checkNumber: p.checkNumber || '-', debit: toNum(p.amount), credit: null,
      type: 'payment', source: 'payments', isPaymentDeduction: true
    }));
    ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    return ledger.map(e => {
      if (e.credit) bal += e.credit;
      if (e.debit)  bal -= e.debit;
      return { ...e, balance: bal };
    }).reverse();
  };

  const clearForm = () => setForm(emptyForm);

  // ── add handlers ──
  const handleAddPurchase = async () => {
    const { amount, billNumber, date } = form;
    if (!amount || !billNumber || !date || !selectedParty) return alert('Fill all purchase fields.');
    const base = toNum(amount);
    if (base <= 0) return alert('Enter a valid amount.');
    const gst = base * 0.05;
    await addDoc(collection(db, 'purchases'), {
      type: 'purchase', amount: Math.round(base + gst),
      gstAmount: gst, baseAmount: base,
      party: selectedParty, billNumber, date
    });
    clearForm();
  };

  const handleAddPayment = async () => {
    const { payment, paymentMethod, date, checkNumber } = form;
    const amt = toNum(payment);
    if (!payment || !paymentMethod || !date || !selectedParty) return alert('Fill all payment fields.');
    if (totalOwed <= 0) return alert('No outstanding balance.');
    if (amt > totalOwed) return alert(`Cannot pay more than owed (₹${totalOwed.toFixed(2)}).`);
    if (paymentMethod !== 'Cash' && bankBal < amt) return alert('Not enough money in bank.');
    await addDoc(collection(db, 'payments'), {
      type: 'payment', amount: amt, method: paymentMethod,
      party: selectedParty, date,
      checkNumber: paymentMethod === 'Check' ? checkNumber : null
    });
    if (paymentMethod !== 'Cash') {
      await setDoc(doc(db, 'meta', 'bank'), { balance: bankBal - amt });
      await addDoc(collection(db, 'bankDeposits'), { amount: -amt, date, party: selectedParty, isPaymentDeduction: true, paymentMethod });
    }
    clearForm();
  };

  const handleAddReturn = async () => {
    const { returnAmount, returnDate, billNumber, comment } = form;
    if (!returnAmount || !returnDate || !selectedParty) return alert('Fill all return fields.');
    if (!comment.trim()) return alert('Please add a comment for the return.');
    await addDoc(collection(db, 'returns'), {
      type: 'return', amount: toNum(returnAmount),
      party: selectedParty, date: returnDate,
      billNumber: billNumber || null, comment
    });
    clearForm();
  };

  const handleDeposit = async () => {
    const amt  = toNum(form.depositAmount);
    const date = form.depositDate || new Date().toISOString();
    if (amt <= 0) return alert('Enter a valid amount.');
    await setDoc(doc(db, 'meta', 'bank'), { balance: bankBal + amt });
    await addDoc(collection(db, 'bankDeposits'), { amount: amt, date, isPaymentDeduction: false });
    setForm(f => ({ ...f, depositAmount: '', depositDate: '' }));
  };

  const handleAddParty = async () => {
    const f = partyForm;
    if (!f.businessName || !f.phoneNumber || !f.bankNumber || !f.contactName || !f.contactMobile || !f.bankName)
      return alert('Please fill all party fields.');
    await addDoc(collection(db, 'parties'), { ...f });
    setPartyForm({ businessName: '', phoneNumber: '', bankNumber: '', bankName: '', contactName: '', contactMobile: '' });
    setShowPartyForm(false);
  };

  // ── delete handlers ──
  const handleDeleteParty = async (p) => {
    if (!window.confirm(`Delete party "${p.businessName}"?\nThis will NOT delete their transactions.`)) return;
    await deleteDoc(doc(db, 'parties', p.id)).catch(() => alert('Failed to delete party.'));
  };

  const handleDeleteTx = async (tx) => {
    const label = tx.type === 'purchase'
      ? `purchase of ₹${toNum(tx.amount).toFixed(2)} for ${tx.party}`
      : tx.type === 'payment'
      ? `payment of ₹${toNum(tx.amount).toFixed(2)} to ${tx.party}`
      : `return of ₹${toNum(tx.amount).toFixed(2)} for ${tx.party}`;
    if (!window.confirm(`Delete this ${label}?`)) return;
    const coll = tx.type === 'purchase' ? 'purchases' : tx.type === 'payment' ? 'payments' : 'returns';
    try {
      if (tx.type === 'payment' && tx.method && tx.method !== 'Cash') {
        const amt = toNum(tx.amount);
        await setDoc(doc(db, 'meta', 'bank'), { balance: bankBal + amt });
        const snap = await getDocs(query(collection(db, 'bankDeposits'), where('isPaymentDeduction', '==', true)));
        const match = snap.docs.find(d => toNum(d.data().amount) === -amt && (d.data().party || '') === (tx.party || ''));
        if (match) await deleteDoc(doc(db, 'bankDeposits', match.id));
      }
      await deleteDoc(doc(db, coll, tx.id));
    } catch (e) { alert('Failed to delete transaction.'); }
  };

  const handleDeleteDeposit = async (entry) => {
    if (entry.isPaymentDeduction) return alert('Cannot delete payment-linked entries here. Delete from the Payments section.');
    if (!window.confirm('Delete this deposit entry and reverse the bank balance?')) return;
    try {
      const delta = entry.credit ? -entry.credit : entry.debit ? entry.debit : 0;
      await setDoc(doc(db, 'meta', 'bank'), { balance: bankBal + delta });
      await deleteDoc(doc(db, 'bankDeposits', entry.id));
    } catch { alert('Failed to delete deposit.'); }
  };

  // ── edit ──
  const openEdit = (tx) => { setEditTx(tx); setEditForm({ ...tx, amount: toNum(tx.amount) }); };

  const handleEditSave = async () => {
    if (!editForm.amount || !editForm.date) return alert('Fill required fields.');
    const coll = editTx.type === 'purchase' ? 'purchases' : editTx.type === 'payment' ? 'payments' : 'returns';
    await updateDoc(doc(db, coll, editTx.id), { ...editTx, ...editForm, amount: toNum(editForm.amount) });
    setEditTx(null);
  };

  // ── PDF exports ──
  const exportPurchasePDF = () => {
    const list = inRange(purchases.filter(t => !selectedParty || t.party === selectedParty), pFrom, pTo)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!list.length) return alert('No purchase records in selected range.');
    makePDF('Purchase History', 'purchase_history.pdf',
      ['Party', 'Date', 'Bill No', 'Base Amount', 'GST (5%)', 'Total Amount'],
      list.map(t => [t.party, t.date, t.billNumber || '-',
        '₹' + toNum(t.baseAmount).toFixed(2),
        '₹' + toNum(t.gstAmount).toFixed(2),
        '₹' + toNum(t.amount).toFixed(2)])
    );
  };

  const exportPaymentPDF = () => {
    const list = inRange(payments.filter(t => !selectedParty || t.party === selectedParty), payFrom, payTo)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!list.length) return alert('No payment records in selected range.');
    makePDF('Payment History', 'payment_history.pdf',
      ['Party', 'Date', 'Method', 'Check No', 'Amount'],
      list.map(t => [t.party, t.date, t.method || '-', t.checkNumber || '-', '₹' + toNum(t.amount).toFixed(2)])
    );
  };

  const exportReturnPDF = () => {
    const list = inRange(returns.filter(t => !selectedParty || t.party === selectedParty), rFrom, rTo)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!list.length) return alert('No return records in selected range.');
    makePDF('Return History', 'return_history.pdf',
      ['Party', 'Date', 'Bill No', 'Comment', 'Amount'],
      list.map(t => [t.party, t.date, t.billNumber || '-', t.comment || '-', '₹' + toNum(t.amount).toFixed(2)])
    );
  };

  const exportBalancePDF = () => {
    const list = inRange(filteredTx, bFrom, bTo).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!list.length) return alert('No records in selected range.');
    makePDF(selectedParty ? `Balance — ${selectedParty}` : 'All Party Balance', 'balance_history.pdf',
      ['Party', 'Date', 'Type', 'Amount'],
      list.map(t => [t.party, t.date, t.type, '₹' + toNum(t.amount).toFixed(2)])
    );
  };

  const exportPartyPDF = () => {
    if (!parties.length) return alert('No parties to export.');
    makePDF('Party List', 'parties.pdf',
      ['Business', 'Phone', 'Bank Name', 'Contact', 'Mobile'],
      parties.map(p => [p.businessName, p.phoneNumber, p.bankName, p.contactName, p.contactMobile])
    );
  };

  const exportAllCSV = () => {
    const rows = [['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment']];
    inRange(allTx, homeFrom, homeTo).forEach(t =>
      rows.push([t.date, t.party, t.type, toNum(t.amount), t.gstAmount || '', t.method || '', t.billNumber || '', t.checkNumber || '', t.comment || ''])
    );
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'transactions.csv'
    });
    document.body.appendChild(a); a.click(); a.remove();
  };

  const exportAllPDF = () => {
    const list = inRange(allTx, homeFrom, homeTo);
    if (!list.length) return alert('No records in selected range.');
    makePDF('Full Transaction Report', 'all_transactions.pdf',
      ['Date', 'Party', 'Type', 'Amount'],
      list.map(t => [t.date, t.party, t.type, '₹' + toNum(t.amount).toFixed(2)])
    );
  };

  // ── small sub-components ──
  const PartySelect = () => (
    <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
      <option value="">-- Select Party --</option>
      {parties.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
    </select>
  );

  const RecentHistory = ({ type }) => {
    const src  = type === 'purchase' ? purchases : type === 'payment' ? payments : returns;
    const list = src.filter(t => t.party === selectedParty).slice(0, 10);
    if (!list.length)
      return <p style={{ color: '#888', marginTop: 12 }}>No {type} history for this party.</p>;
    return (
      <div style={{ marginTop: 22 }}>
        <h4>Recent {type.charAt(0).toUpperCase() + type.slice(1)} History</h4>
        <TxTable transactions={list} onEdit={openEdit} onComment={setCommentTx} onDelete={handleDeleteTx} />
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="home-page">

      {/* ── sidebar ── */}
      <div className="sidebar">
        <h1 className="nrv-logo">SRV</h1>
        {['home', 'purchase', 'pay', 'return', 'balance', 'party', 'bank', 'salary'].map(v => (
          <button key={v} style={{ marginBottom: 15 }} onClick={() => setView(v)}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div className="content">

        {/* ── Edit Modal ── */}
        {editTx && (
          <div className="modal">
            <div style={{ background: '#fff', padding: 22, borderRadius: 6, maxWidth: 420, margin: 'auto', border: '1px solid #ccc' }}>
              <h3 style={{ marginBottom: 12 }}>Edit Transaction</h3>
              <label style={{ display: 'block', marginBottom: 8 }}>Date:
                <input type="date" value={editForm.date || ''} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>Party:
                <select value={editForm.party || ''} onChange={e => setEditForm(f => ({ ...f, party: e.target.value }))}>
                  {parties.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>Amount:
                <input type="number" value={editForm.amount || ''} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>Bill No:
                <input type="text" value={editForm.billNumber || ''} onChange={e => setEditForm(f => ({ ...f, billNumber: e.target.value }))} />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>Method:
                <input type="text" value={editForm.method || ''} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} />
              </label>
              {editTx.type === 'return' && (
                <label style={{ display: 'block', marginBottom: 8 }}>Comment:
                  <textarea value={editForm.comment || ''} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} style={{ width: '100%' }} />
                </label>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={handleEditSave} style={{ ...S.editBtn, padding: '6px 16px' }}>Save</button>
                <button onClick={() => setEditTx(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Comment Modal ── */}
        <CommentModal tx={commentTx} onClose={() => setCommentTx(null)} />

        {/* ══════════ HOME - ALL TRANSACTIONS TABLE ══════════ */}
        {view === 'home' && (
          <>
            <h1>SANJIVANI SADI</h1>
            <h3>Total Owed (All Parties): ₹{totalOwed.toFixed(2)}</h3>
            <p>Total GST on Purchases: ₹{purchases.reduce((s, t) => s + toNum(t.gstAmount), 0).toFixed(2)}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
              <label>From: <input type="date" value={homeFrom} onChange={e => setHomeFrom(e.target.value)} /></label>
              <label>To: <input type="date" value={homeTo} onChange={e => setHomeTo(e.target.value)} /></label>
              <button onClick={exportAllCSV}>📥 Export CSV</button>
              <button style={S.redBtn} onClick={exportAllPDF}>📄 Export PDF</button>
            </div>
            <TxTable
              transactions={allTx}
              onEdit={openEdit}
              onComment={setCommentTx}
              onDelete={handleDeleteTx}
            />
          </>
        )}

        {/* ══════════ PURCHASE - PURCHASE TRANSACTION HISTORY TABLE ══════════ */}
        {view === 'purchase' && (
          <div className="form-container">
            <h2>Purchase Entry</h2>
            <PartySelect />
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <input type="text" placeholder="Bill No" value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} />
            <input type="number" placeholder="Amount (before GST)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            {toNum(form.amount) > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0f7ff', borderRadius: 4 }}>
                <p>GST (5%): ₹{(toNum(form.amount) * 0.05).toFixed(2)}</p>
                <p><b>Total with GST: ₹{Math.round(toNum(form.amount) * 1.05)}</b></p>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button className="addPurchase-button" onClick={handleAddPurchase}>Add Purchase</button>
              <button className="clearForm-button" onClick={clearForm} style={{ marginLeft: 10 }}>Clear</button>
            </div>

            <DateFilter from={pFrom} setFrom={setPFrom} to={pTo} setTo={setPTo}
              label="Export Purchase PDF:" onExport={exportPurchasePDF} />

            {selectedParty && (
              <div>
                <h3>Purchase Transaction History</h3>
                <PurchaseTransactionTable
                  transactions={purchases.filter(t => t.party === selectedParty)}
                  onEdit={openEdit}
                  onComment={setCommentTx}
                  onDelete={handleDeleteTx}
                />
              </div>
            )}
          </div>
        )}

        {/* ══════════ PAY - PAYMENT TRANSACTION HISTORY TABLE ══════════ */}
        {view === 'pay' && (
          <div className="form-container">
            <h2>Payment Entry</h2>
            <PartySelect />
            {selectedParty && (
              <p style={{ color: '#c0392b', fontWeight: 'bold', margin: '6px 0' }}>
                Outstanding Balance: ₹{totalOwed.toFixed(2)}
              </p>
            )}
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <input type="number" placeholder="Amount to Pay" value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))} />
            <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
              <option value="">-- Select Payment Method --</option>
              <option value="Cash">Cash</option>
              <option value="NEFT">NEFT</option>
              <option value="Check">Check</option>
            </select>
            {form.paymentMethod === 'Check' && (
              <input type="text" placeholder="Check Number" value={form.checkNumber} onChange={e => setForm(f => ({ ...f, checkNumber: e.target.value }))} />
            )}
            <div style={{ marginTop: 10 }}>
              <button className="addPurchase-button" onClick={handleAddPayment}>Add Payment</button>
              <button className="clearForm-button" onClick={clearForm} style={{ marginLeft: 10 }}>Clear</button>
            </div>

            <DateFilter from={payFrom} setFrom={setPayFrom} to={payTo} setTo={setPayTo}
              label="Export Payment PDF:" onExport={exportPaymentPDF} />

            {selectedParty && (
              <div>
                <h3>Payment Transaction History</h3>
                <PaymentTransactionTable
                  transactions={payments.filter(t => t.party === selectedParty)}
                  onEdit={openEdit}
                  onComment={setCommentTx}
                  onDelete={handleDeleteTx}
                />
              </div>
            )}
          </div>
        )}

        {/* ══════════ RETURN - RETURN TRANSACTION HISTORY TABLE ══════════ */}
        {view === 'return' && (
          <div className="form-container">
            <h2>Return Entry</h2>
            <PartySelect />
            <input type="number" placeholder="Return Amount" value={form.returnAmount} onChange={e => setForm(f => ({ ...f, returnAmount: e.target.value }))} />
            <input type="text" placeholder="Bill No (optional)" value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} />
            <input type="date" value={form.returnDate} onChange={e => setForm(f => ({ ...f, returnDate: e.target.value }))} />
            <textarea placeholder="Reason for return (required)" value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              style={{ width: '100%', minHeight: 50, marginTop: 6, padding: 6 }} />
            <div style={{ marginTop: 10 }}>
              <button className="addPurchase-button" onClick={handleAddReturn}>Add Return</button>
              <button className="clearForm-button" onClick={clearForm} style={{ marginLeft: 10 }}>Clear</button>
            </div>

            <DateFilter from={rFrom} setFrom={setRFrom} to={rTo} setTo={setRTo}
              label="Export Return PDF:" onExport={exportReturnPDF} />

            {selectedParty && (
              <div>
                <h3>Return Transaction History</h3>
                <ReturnTransactionTable
                  transactions={returns.filter(t => t.party === selectedParty)}
                  onEdit={openEdit}
                  onComment={setCommentTx}
                  onDelete={handleDeleteTx}
                />
              </div>
            )}
          </div>
        )}

        {/* ══════════ BALANCE - BALANCE TRANSACTION HISTORY TABLE ══════════ */}
        {view === 'balance' && (
          <div className="form-container">
            <h2>Balance Ledger</h2>
            <PartySelect />
            <p><b>Total Owed:</b> ₹{totalOwed.toFixed(2)}</p>
            <p><b>Total GST on Purchases:</b> ₹{filteredTx.filter(t => t.type === 'purchase').reduce((s, t) => s + toNum(t.gstAmount), 0).toFixed(2)}</p>

            <DateFilter from={bFrom} setFrom={setBFrom} to={bTo} setTo={setBTo}
              label="Export Balance PDF:" onExport={exportBalancePDF} />

            <h3>Balance Transaction History</h3>
            <BalanceTransactionTable
              transactions={inRange(filteredTx, bFrom, bTo)}
              onEdit={openEdit}
              onComment={setCommentTx}
              onDelete={handleDeleteTx}
            />
          </div>
        )}

        {/* ══════════ PARTY ══════════ */}
        {view === 'party' && (
          <div className="form-container">
            <h2>All Parties</h2>
            <div style={{ marginBottom: 14 }}>
              <button style={S.redBtn} onClick={exportPartyPDF}>📄 Export Parties PDF</button>
            </div>
            <PartyTable parties={parties} onDelete={handleDeleteParty} />
            <button className="addPurchase-button" onClick={() => setShowPartyForm(s => !s)} style={{ margin: '16px 0' }}>
              {showPartyForm ? 'Cancel' : '+ Add New Party'}
            </button>
            {showPartyForm && (
              <div className="party-form">
                {[
                  ['Business Name',    'businessName'],
                  ['Phone Number',     'phoneNumber'],
                  ['Bank Account No',  'bankNumber'],
                  ['Bank Name',        'bankName'],
                  ['Contact Person',   'contactName'],
                  ['Contact Mobile',   'contactMobile'],
                ].map(([ph, key]) => (
                  <input key={key} placeholder={ph} value={partyForm[key]}
                    onChange={e => setPartyForm(f => ({ ...f, [key]: e.target.value }))} />
                ))}
                <button className="addPurchase-button" onClick={handleAddParty}>Save Party</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════ BANK ══════════ */}
        {view === 'bank' && (
          <div className="form-container">
            <h2>Bank Balance: ₹{bankBal.toFixed(2)}</h2>
            <input type="number" placeholder="Deposit amount"
              value={form.depositAmount || ''}
              onChange={e => setForm(f => ({ ...f, depositAmount: e.target.value }))} />
            <input type="date"
              value={form.depositDate || ''}
              onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))} />
            <button className="addPurchase-button" onClick={handleDeposit} style={{ marginTop: 8 }}>Deposit</button>

            <h3 style={{ marginTop: 24 }}>Bank Ledger</h3>
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="transaction-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Date</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Party</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Method</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Check No</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Debit</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Credit</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Balance</th>
                  <th style={{ fontSize: '12px', padding: '6px' }}>Delete</th>
                </tr></thead>
                <tbody>
                  {getBankLedger().map((e, i) => (
                    <tr key={i} style={{ fontSize: '12px' }}>
                      <td style={{ padding: '4px 6px' }}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '4px 6px' }}>{e.party}</td>
                      <td style={{ padding: '4px 6px' }}>{e.method}</td>
                      <td style={{ padding: '4px 6px' }}>{e.checkNumber || '-'}</td>
                      <td style={{ padding: '4px 6px', color: e.debit  ? '#c0392b' : undefined }}>{e.debit  ? '₹' + e.debit.toFixed(2)  : '-'}</td>
                      <td style={{ padding: '4px 6px', color: e.credit ? '#27ae60' : undefined }}>{e.credit ? '₹' + e.credit.toFixed(2) : '-'}</td>
                      <td style={{ padding: '4px 6px' }}>₹{e.balance.toFixed(2)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {!e.isPaymentDeduction && e.source === 'bankDeposits'
                          ? <button style={S.delBtn} onClick={() => handleDeleteDeposit(e)}>🗑 Delete</button>
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════ SALARY ══════════ */}
        {view === 'salary' && (
          <div className="form-container">
            <h2>Salary Payment</h2>
            <p style={{ color: '#888' }}>Coming soon.</p>
          </div>
        )}

      </div>
    </div>
  );
}