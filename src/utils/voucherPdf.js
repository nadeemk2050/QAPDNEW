import { jsPDF } from 'jspdf'

function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

export const getStandardizedVoucher = (tx) => {
  let typeLabel = 'Payment'
  let isContra = false
  let isReceipt = false
  
  const typeLower = (tx.type || '').toLowerCase()
  const subTypeLower = (tx.subType || '').toLowerCase()
  
  if (typeLower === 'contra' || subTypeLower === 'contra') {
    typeLabel = 'Contra'
    isContra = true
  } else if (typeLower === 'receipt' || subTypeLower === 'in' || subTypeLower === 'receipt') {
    typeLabel = 'Receipt'
    isReceipt = true
  } else {
    typeLabel = 'Payment'
  }
  
  let fromAccountName = tx.fromAccountName || (isContra ? tx.crName : '') || (isReceipt ? (tx.partyName || tx.crName) : tx.accountName) || ''
  let toAccountName = tx.toAccountName || (isContra ? tx.drName : '') || (isReceipt ? tx.accountName : (tx.partyName || tx.drName)) || ''
  
  if (!fromAccountName && !isContra) {
    fromAccountName = isReceipt ? 'Particulars' : (tx.accountName || 'Cash/Bank')
  }
  if (!toAccountName && !isContra) {
    toAccountName = isReceipt ? (tx.accountName || 'Cash/Bank') : 'Particulars'
  }
  
  let rows = tx.rows || []
  if (rows.length === 0 && !isContra) {
    if (tx.payments && tx.payments.length > 0) {
      rows = tx.payments.map(p => ({
        ledgerName: p.ledgerName || p.ledgerId || 'Particulars',
        amount: Number(p.amount || 0),
        narration: p.narration || ''
      }))
    } else if (tx.splits && tx.splits.length > 0) {
      rows = tx.splits.map(s => ({
        ledgerName: s.targetName || '',
        amount: Number(s.amount || 0),
        narration: s.narration || ''
      }))
    } else {
      const ledgerName = isReceipt ? fromAccountName : toAccountName
      rows = [{
        ledgerName: ledgerName === 'Particulars' ? (tx.partyName || 'Particulars') : ledgerName,
        amount: Number(tx.amount || 0),
        narration: tx.narration || tx.description || ''
      }]
    }
  }
  
  return {
    refNo: tx.refNo || '—',
    date: tx.date || new Date().toISOString().split('T')[0],
    typeLabel,
    isContra,
    isReceipt,
    fromAccountName,
    toAccountName,
    accountName: tx.accountName || (isReceipt ? toAccountName : fromAccountName),
    totalAmount: Number(tx.totalAmount || tx.amount || 0),
    narration: tx.narration || tx.description || '',
    rows
  }
}

export const generateVoucherPdf = (tx) => {
  const v = getStandardizedVoucher(tx)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5'
  })

  // Theme colors
  const primaryColor = [30, 58, 138] // Navy
  const textColor = [55, 65, 81] // Dark Grey
  const lightGrey = [243, 244, 246]

  // Draw Header Banner
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, 148, 25, 'F')

  // Title
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('QUICKACCPRO VOUCHER', 10, 16)

  // Type Label Badge
  doc.setFillColor(255, 255, 255)
  doc.rect(100, 10, 38, 7, 'F')
  doc.setTextColor(...primaryColor)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(v.typeLabel.toUpperCase(), 119, 15, { align: 'center' })

  // Reset text properties
  doc.setTextColor(...textColor)
  doc.setFont('helvetica', 'normal')

  // Metadata block (Ref No & Date)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Reference No:', 10, 35)
  doc.setFont('helvetica', 'normal')
  doc.text(v.refNo, 38, 35)

  doc.setFont('helvetica', 'bold')
  doc.text('Date:', 90, 35)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(v.date), 102, 35)

  // Divider line
  doc.setDrawColor(229, 231, 235)
  doc.line(10, 39, 138, 39)

  let nextY = 46

  if (v.isContra) {
    // Contra details
    doc.setFillColor(...lightGrey)
    doc.rect(10, nextY, 128, 18, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('From Account:', 14, nextY + 6)
    doc.text('To Account:', 14, nextY + 13)

    doc.setFont('helvetica', 'normal')
    doc.text(v.fromAccountName, 40, nextY + 6)
    doc.text(v.toAccountName, 40, nextY + 13)

    nextY += 26
  } else {
    // Payment/Receipt details
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(v.isReceipt ? 'Deposit To (Cash/Bank):' : 'Paid From (Cash/Bank):', 10, nextY)
    doc.setFont('helvetica', 'normal')
    doc.text(v.accountName, 55, nextY)

    nextY += 8

    // Particulars Table Header
    doc.setFillColor(...primaryColor)
    doc.rect(10, nextY, 128, 7, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('Particulars / Ledger Account', 13, nextY + 5)
    doc.text('Amount (AED)', 135, nextY + 5, { align: 'right' })

    nextY += 7
    doc.setTextColor(...textColor)

    // Table rows
    v.rows.forEach((row, i) => {
      // Row Background alternating
      if (i % 2 === 1) {
        doc.setFillColor(...lightGrey)
        doc.rect(10, nextY, 128, 7, 'F')
      }
      doc.setFont('helvetica', 'normal')
      doc.text(row.ledgerName, 13, nextY + 5)
      doc.text(formatCurrency(row.amount), 135, nextY + 5, { align: 'right' })
      
      if (row.narration) {
        nextY += 7
        doc.setFont('helvetica', 'oblique')
        doc.setFontSize(7.5)
        doc.setTextColor(100, 116, 139)
        doc.text(`* ${row.narration}`, 15, nextY + 4)
        doc.setTextColor(...textColor)
        doc.setFontSize(9)
      }
      nextY += 7
    })
  }

  // Draw Bottom border or Divider
  doc.setDrawColor(229, 231, 235)
  doc.line(10, nextY + 2, 138, nextY + 2)
  nextY += 8

  // Total Amount Box
  doc.setFillColor(...lightGrey)
  doc.rect(80, nextY - 4, 58, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('Total (AED):', 84, nextY + 2)
  doc.setFont('helvetica', 'bold')
  doc.text(formatCurrency(v.totalAmount), 134, nextY + 2, { align: 'right' })

  nextY += 12

  // Narration block
  if (v.narration) {
    doc.setFont('helvetica', 'bold')
    doc.text('Narration:', 10, nextY)
    doc.setFont('helvetica', 'normal')
    
    const splitNarration = doc.splitTextToSize(v.narration, 105)
    doc.text(splitNarration, 28, nextY)
    nextY += (splitNarration.length * 4.5) + 4
  }

  // Footer note
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(156, 163, 175)
  doc.text('Generated via QUICKACCPRO PWA Companion App', 74, 202, { align: 'center' })

  return doc
}

export const downloadVoucherPdf = (tx) => {
  const v = getStandardizedVoucher(tx)
  const doc = generateVoucherPdf(tx)
  doc.save(`Voucher-${v.refNo}.pdf`)
}

export const shareVoucherPdf = async (tx) => {
  const v = getStandardizedVoucher(tx)
  const doc = generateVoucherPdf(tx)
  const blob = doc.output('blob')
  const file = new File([blob], `Voucher-${v.refNo}.pdf`, { type: 'application/pdf' })

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Voucher ${v.refNo}`,
        text: `Here is the PDF voucher for Ref No: ${v.refNo}`
      })
      return true
    } catch (err) {
      if (err.name === 'AbortError') return false
      console.error('Web Share PDF failed, fallback to text/whatsapp:', err)
    }
  }

  // Fallback to text sharing and PDF download
  downloadVoucherPdf(tx)
  
  let text = `📄 *QUICKACCPRO VOUCHER PDF DOWNLOADED*\n`
  text += `-----------------------------------\n`
  text += `*Ref No:* ${v.refNo}\n`
  text += `*Date:* ${v.date}\n`
  text += `*Type:* ${v.typeLabel}\n`
  text += `*Amount:* AED ${formatCurrency(v.totalAmount)}\n`
  text += `-----------------------------------\n`
  text += `PDF receipt downloaded to device. Please attach it manually to send.`
  
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  window.open(url, '_blank')
  return false
}

export const getShareText = (tx) => {
  const v = getStandardizedVoucher(tx)
  let text = `📄 *QUICKACCPRO VOUCHER*\n`
  text += `-----------------------------------\n`
  text += `*Ref No:* ${v.refNo}\n`
  text += `*Date:* ${v.date}\n`
  text += `*Type:* ${v.typeLabel}\n`
  
  if (v.isContra) {
    text += `*From Account:* ${v.fromAccountName}\n`
    text += `*To Account:* ${v.toAccountName}\n`
  } else {
    text += `*Cash/Bank:* ${v.accountName}\n`
  }
  text += `-----------------------------------\n`
  
  if (!v.isContra && v.rows && v.rows.length > 0) {
    v.rows.forEach((r, idx) => {
      text += `${idx + 1}. *Ledger:* ${r.ledgerName}\n`
      text += `    *Amount:* AED ${formatCurrency(r.amount)}\n`
      if (r.narration) {
        text += `    *Narration:* ${r.narration}\n`
      }
    })
    text += `-----------------------------------\n`
  }
  
  text += `*Total Amount:* AED ${formatCurrency(v.totalAmount)}\n`
  if (v.narration) {
    text += `*Narration:* ${v.narration}\n`
  }
  text += `-----------------------------------\n`
  text += `Generated via QUICKACCPRO PWA`
  return text
}

export const shareVoucherText = async (tx) => {
  const shareText = getShareText(tx)
  const v = getStandardizedVoucher(tx)
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Voucher ${v.refNo}`,
        text: shareText
      })
      return true
    } catch (err) {
      if (err.name === 'AbortError') return false
      console.error('Web Share text failed, fallback to WhatsApp:', err)
    }
  }
  
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`
  window.open(url, '_blank')
  return false
}
