# CafeFlow — Cafe Self-Ordering & Smart Operations Platform
## System Design aligned with AndamanTech / Andaman Smart Operations

**Version:** 1.0  
**Document Type:** System Design / SRS Draft  
**Platform:** Web Application / Local Network / Standalone-first  
**Brand Direction:** AndamanTech Smart Operations  
**Suggested Product Name:** **CafeFlow**

---

# 1. Executive Summary

CafeFlow คือระบบ Self-Ordering และ Smart Operations สำหรับร้านคาเฟ่ ออกแบบเพื่อบริหาร Flow ตั้งแต่ลูกค้าเลือกเมนู ชำระเงิน ส่ง Order เข้าครัว ติดตามการผลิต เรียกรับสินค้า ไปจนถึงการปิดรอบยอดขายประจำวัน

ระบบเน้นการทำงานแบบ **Standalone / Local Network First** เพื่อให้ร้านยังสามารถดำเนินงานได้แม้ Internet ภายนอกมีปัญหา โดยมี Local Server เป็นศูนย์กลาง และรองรับหลาย Kiosk, Cashier, Kitchen Display, Customer Display และ Manager Dashboard ภายในเครือข่าย Wi-Fi/LAN เดียวกัน

แนวคิดระบบยึดหลัก Smart Operations ของ AndamanTech:

> **Flow First → Identify → Track → Control → Verify → Analyze → Optimize → Automate**

เป้าหมาย Phase แรกคือ **งานขายและ Operation หน้าร้าน** โดยยังไม่รวม Inventory, Recipe, Purchasing หรือระบบคลังสินค้า

---

# 2. Business Objectives

1. ลดเวลาการรับ Order ที่เคาน์เตอร์
2. รองรับ Self-Service Ordering หลาย Kiosk
3. ลดความผิดพลาดจากการรับ Order ด้วยวาจา
4. รองรับ Cash และ QR Payment
5. ตรวจสอบการชำระก่อนส่ง Order เข้าครัว
6. กระจาย Order ไปยัง Kitchen Station ตามประเภทสินค้า
7. แสดงสถานะ Order แบบ Real-time
8. รองรับ Kitchen Printer และ Kitchen Display System
9. แสดงหมายเลข Order พร้อมโฆษณาบน Customer Display
10. เก็บข้อมูลยอดขายสำหรับปิดรอบและ Export CSV
11. ให้ผู้จัดการ Monitor ระบบผ่านอุปกรณ์ในเครือข่ายเดียวกัน
12. รองรับการขยายไป Multi-Kiosk / Multi-Cashier / Multi-Station ในอนาคต

---

# 3. Smart Operations Model

CafeFlow แปลงแนวคิด Smart Operations ของ AndamanTech ให้เหมาะกับงานร้านคาเฟ่ ดังนี้

## 3.1 Core Operational Entities

- **CUSTOMER** — ลูกค้า / พนักงาน / Cashier
- **ORDER** — เมนู รายการสั่ง Modifier หมายเลข Order
- **PAYMENT** — Cash / QR / Verification / Reconciliation
- **PRODUCTION** — Bar / Kitchen / Bakery / Pickup
- **INFORMATION** — Sales / Queue / Lead Time / Dashboard / Audit

---

# 4. Core Value Chain

## 4.1 Identify
ระบุ:
- Product
- Order
- Kiosk
- Cashier
- Kitchen Station
- User
- Payment Method

## 4.2 Track
ติดตาม Order ตั้งแต่:
- Created
- Waiting Payment
- Paid
- Sent to Kitchen
- Preparing
- Ready
- Served
- Completed

## 4.3 Control
ควบคุม:
- Queue
- Cashier Routing
- Kitchen Routing
- User Access
- Device Assignment
- Menu Availability

## 4.4 Verify
ตรวจสอบ:
- Cash Payment Confirmation
- QR Payment
- Slip OCR
- Payment Amount
- Payment Time
- Duplicate Transaction

## 4.5 Analyze
วิเคราะห์:
- Waiting Time
- Preparation Time
- Order Lead Time
- Sales
- Orders / Hour
- Station Load

## 4.6 Optimize
ใช้ข้อมูลเพื่อ:
- ปรับ Menu Layout
- ปรับ Kitchen Station
- ปรับ Staffing
- ลด Bottleneck
- ลด Waiting Time

## 4.7 Automate
รองรับ:
- Auto Routing
- Auto Print
- Auto Payment Verify
- Voice Notification
- Queue Display
- Kitchen Display

---

# 5. Overall System Architecture

```text
                    ANDAMAN SMART OPERATIONS
                           CafeFlow

                              │
                  ┌───────────┴───────────┐
                  │                       │
            CUSTOMER FLOW           OPERATION FLOW
                  │                       │
          ┌───────▼───────┐       ┌──────▼──────┐
          │   KIOSK 01    │       │ CASHIER 01  │
          ├───────────────┤       └──────┬──────┘
          │   KIOSK 02    │              │
          ├───────────────┤              │
          │   KIOSK 03    │              │
          └───────┬───────┘              │
                  │                      │
                  └──────────┬───────────┘
                             ▼
                  ┌──────────────────────┐
                  │   LOCAL APP SERVER   │
                  │                      │
                  │ Order Engine         │
                  │ Payment Engine       │
                  │ Queue Engine         │
                  │ Routing Engine       │
                  │ Verify Engine        │
                  │ User / RBAC          │
                  │ Reporting            │
                  │ Device Management    │
                  └──────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
          KITCHEN        CUSTOMER        MANAGER
           FLOW           DISPLAY         CONTROL

        BAR / FOOD         Queue          Dashboard
        BAKERY / KDS       Media          Menu
        PRINTER            Pickup         Report
                                            │
                                            ▼
                                      CSV / Closing
```

---

# 6. Recommended Technology Stack

## Backend
- Python
- FastAPI
- SQLAlchemy
- WebSocket
- Background Worker
- REST API

## Frontend
แนะนำ:
- HTML
- CSS
- JavaScript
- Jinja2
- HTMX
- Alpine.js

เหตุผล:
- เบา
- ใช้ Resource ต่ำ
- UI ทันสมัย
- ไม่ต้องใช้ Frontend Framework ขนาดใหญ่
- เหมาะกับ Local Web Application

## Database

### MVP / Single Machine
- SQLite

### Production Recommendation
- PostgreSQL

สำหรับระบบที่มี:
- หลาย Kiosk
- Cashier
- KDS
- Manager
- Customer Display

แนะนำ PostgreSQL ตั้งแต่เริ่ม Production

## Computer Vision / Slip OCR
- OpenCV
- PaddleOCR หรือ OCR Engine อื่น
- QR / Barcode Reader
- Optional YOLO สำหรับ Slip Detection

---

# 7. Order Lifecycle

```text
DRAFT
  │
  ▼
ORDER_CONFIRMED
  │
  ├── CASH ────────────────┐
  │                        ▼
  │                  WAITING_CASH
  │                        │
  │                 Cashier Confirm
  │                        │
  └── QR ───────► WAITING_PAYMENT
                           │
                    Payment Verified
                           │
                           ▼
                         PAID
                           │
                           ▼
                    SENT_TO_KITCHEN
                           │
                           ▼
                       PREPARING
                           │
                           ▼
                         READY
                           │
                           ▼
                        SERVED
                           │
                           ▼
                       COMPLETED
```

## Special Status
- PAYMENT_TIMEOUT
- PAYMENT_REVIEW
- PAYMENT_FAILED
- CANCELLED
- VOIDED
- REFUNDED
- REPRINTED

---

# 8. Audit Trail

ทุก State Change ต้องเก็บ Log

ตัวอย่าง:

```text
10:31:15 Order created at Kiosk-02
10:32:05 Payment QR generated
10:32:42 Payment slip detected
10:32:44 Payment verified
10:32:45 Order sent to BAR
10:35:20 BAR Ready
10:36:02 Order served
```

ข้อมูลขั้นต่ำ:
- event_type
- order_id
- old_status
- new_status
- user/device
- datetime
- reason
- source_ip

---

# 9. Customer Kiosk Flow

```text
WELCOME
   ↓
เลือกภาษา
   ↓
เลือกหมวดเมนู
   ↓
เลือกสินค้า
   ↓
CUSTOMIZE
   ↓
เพิ่มลงตะกร้า
   ↓
REVIEW ORDER
   ↓
เลือกวิธีชำระเงิน
 ┌────────────┴────────────┐
 ▼                         ▼
CASH                       QR PAYMENT
 │                          │
 ▼                          ▼
Waiting Cashier         Display QR
 │                          │
Cashier Confirm         Verify Payment
 │                          │
 └────────────┬─────────────┘
              ▼
            PAID
              ↓
       Generate Order No.
              ↓
         Send Kitchen
              ↓
      Waiting for Pickup
```

---

# 10. Menu Management

รองรับ:
- Category
- Product
- Product Image
- Product Price
- Active / Inactive
- Sold Out
- Kitchen Station
- Modifier
- Menu Time Availability

ตัวอย่างหมวด:
- Coffee
- Tea
- Smoothie
- Bakery
- Food
- Dessert

---

# 11. Product Modifier Design

ไม่ควร Hard-code Modifier แต่ควรออกแบบเป็น Rule-Based

## Example

```text
ชาไทยเย็น
Base Price: 60 บาท

Sweetness
○ 0%
○ 25%
○ 50%
○ 75%
● 100%

Ice Option
● ปกติ
○ แยกน้ำ / น้ำแข็ง

Add-on
□ ไข่มุก +10
□ วิปครีม +15
```

## Rule Example

```text
IF product_type = COLD_DRINK
    show sweetness
    show separate_water_ice

IF product_type = BLENDED
    show sweetness
    hide separate_water_ice

IF product_type = HOT
    show sweetness
    hide separate_water_ice

IF product_type = FOOD
    hide sweetness
    hide separate_water_ice
```

## Suggested Tables
- Product
- ProductCategory
- ModifierGroup
- ModifierOption
- ProductModifierRule

---

# 12. Cash Payment Flow

รองรับ 3 Mode

## Mode A — Cashier Queue Only

Kiosk:
```text
Order #A105
ยอด 185 บาท

กรุณาชำระเงินกับพนักงาน
```

Cashier:
```text
WAITING CASH

A105
185.00
Kiosk 02
10:32

[รับชำระ]
```

---

## Mode B — Print Payment Ticket

Kiosk พิมพ์:
```text
ORDER A105

ยอดชำระ
185.00 บาท

กรุณาชำระเงินที่ Cashier
```

---

## Mode C — Staff Call

เหมาะกับร้านที่ Cashier ไม่ได้นั่งประจำ

```text
🔔 Cash Request

Kiosk 03
Order A106
฿240
```

Cashier ได้รับเสียงกระดิ่งและ Notification

---

# 13. Cashier Routing

รองรับหลาย Kiosk และหลาย Cashier

```text
Kiosk
  ↓
Cashier Routing Engine
  ↓
Cashier Counter
```

ตัวอย่าง:
```text
Kiosk 01 → Counter 01
Kiosk 02 → Counter 01
Kiosk 03 → Counter 01
```

อนาคต:
```text
Kiosk 01 → Counter A
Kiosk 02 → Counter A
Kiosk 03 → Counter B
Kiosk 04 → Counter B
```

---

# 14. QR Payment Flow

```text
Generate QR
     ↓
Customer Pay
     ↓
Show Slip on Mobile Screen
     ↓
Camera Capture
     ↓
Detect Slip
     ↓
Perspective Correction
     ↓
OCR
     ↓
Extract Payment Data
     ↓
Validation Engine
```

ข้อมูลที่ตรวจ:
- Amount
- Date
- Time
- Bank
- Transaction ID
- Reference

## Validation Rule

```text
Amount = Order Amount
AND
Transaction Time <= Configured Timeout
AND
Transaction Time >= QR Created Time
AND
Transaction ID not duplicate
```

---

# 15. Important Payment Design Principle

Slip OCR ไม่ควรเป็นหลักฐานเดียวสำหรับการยืนยันธุรกรรมถ้ามี Payment Provider หรือ Bank API ที่ตรวจสอบได้

ควรออกแบบไว้รองรับ:

```text
Phase 1
Slip OCR Verification

Phase 2
Payment API / Bank Verification

Phase 3
Auto Reconciliation
```

---

# 16. Payment Timeout

Admin ตั้งค่าได้

```text
QR Payment Timeout
[ 60 ] Seconds
```

เมื่อหมดเวลา:

```text
QR หมดเวลา

หากท่านได้ชำระเงินแล้ว
กรุณาแจ้งพนักงาน

[เรียกพนักงาน]
```

Cashier:
```text
PAYMENT REVIEW

A108
ยอด 140

[ตรวจสอบ]
[ยืนยันการชำระ]
[ยกเลิก]
```

ต้องเก็บ:
- override_by
- override_reason
- override_datetime

---

# 17. Slip OCR Camera UX

ใช้ Auto Detect ไม่ควรให้ลูกค้ากดถ่ายเอง

```text
┌──────────────────────────┐
│                          │
│     วางสลิปในกรอบนี้      │
│                          │
│     ┌──────────────┐     │
│     │              │     │
│     │    CAMERA    │     │
│     │              │     │
│     └──────────────┘     │
│                          │
│ กำลังตรวจสอบการชำระเงิน… │
└──────────────────────────┘
```

Pipeline:
```text
Camera
 ↓
Slip Detection
 ↓
Crop
 ↓
Deskew
 ↓
Brightness / Contrast
 ↓
OCR
 ↓
Payment Parser
 ↓
Validation
```

---

# 18. Kitchen Routing

Product ทุกตัวต้องมี Kitchen Station

ตัวอย่าง:

```text
Americano → BAR
Thai Tea → BAR
Croissant → BAKERY
Spaghetti → KITCHEN
Cake → DESSERT
```

Order A105:

```text
Americano
Croissant
Cake
```

Routing:

```text
BAR
A105
Americano

BAKERY
A105
Croissant

DESSERT
A105
Cake
```

ทั้งหมดอยู่ภายใต้ Order เดียวกัน

---

# 19. Kitchen Option 1 — Printer

รองรับ:
- BAR Printer
- KITCHEN Printer
- BAKERY Printer

Slip:
```text
ORDER A105
10:35

2 x Thai Tea Cold
   Sweet 25%
   Separate Water/Ice

1 x Americano
   Sweet 0%

KIOSK 02
```

Functions:
- Auto Print
- Reprint
- Printer Error
- Fallback Printer

---

# 20. Kitchen Option 2 — Kitchen Display System

```text
BAR STATION

┌─────────────┐
│ A103        │
│ 04:20       │
│             │
│ Thai Tea x2 │
│ Sweet 25%   │
│             │
│ [READY]     │
└─────────────┘
```

แสดง:
- Order No.
- Waiting Time
- Product
- Modifier
- Quantity
- Status

---

# 21. Order Completion Logic

ถ้า Order มีหลาย Station

```text
BAR        READY
BAKERY     READY
KITCHEN    PREPARING
```

Order ยังไม่ Ready

เมื่อ:
```text
BAR        READY
BAKERY     READY
KITCHEN    READY
```

Order เปลี่ยนเป็น:

```text
READY FOR PICKUP
```

---

# 22. Customer Order Status Display

แนะนำ Layout 60/40

```text
┌─────────────────────────────┬───────────────────┐
│                             │                   │
│       ORDER STATUS          │                   │
│                             │   ADVERTISEMENT   │
│ กำลังจัดเตรียม               │                   │
│                             │   Image / Video   │
│ A101  A103  A106            │   Promotion       │
│ A108  A109                  │                   │
│                             │                   │
│─────────────────────────────│                   │
│ พร้อมรับ                    │                   │
│                             │                   │
│ A095  A097  A100            │                   │
│                             │                   │
└─────────────────────────────┴───────────────────┘
```

เมื่อ Ready:
```text
🔔 Ding Dong

Order A105
พร้อมรับที่เคาน์เตอร์
```

---

# 23. Advertising CMS

Manager ตั้ง:
- Image
- Video
- Promotion
- Campaign

กำหนด:
- Start Date
- End Date
- Start Time
- End Time
- Display Screen
- Priority

V1 รองรับ:
- JPG
- PNG
- MP4

---

# 24. Cashier UI

```text
CASHIER CONTROL

TODAY
────────────────────────

Waiting Cash      3
Payment Review    1
Ready             4

WAITING PAYMENT
────────────────────────

A105
Kiosk 02
3 Items
฿185
10:32

[ RECEIVE CASH ]
```

Tabs:
- Waiting Cash
- Payment Review
- Ready
- Order Search

Search:
- Order No.
- Time
- Payment Type
- Status
- Kiosk

---

# 25. Manager Dashboard

```text
SMART CAFE OPERATIONS

TODAY
────────────────────────────

Sales       Orders      Avg Order
฿24,580     216         ฿113.80

Cash        QR
฿8,250      ฿16,330

OPERATIONS
────────────────────────────

Waiting     Preparing   Ready
12          8           4

Avg Wait    Avg Prep    Throughput
03:12       05:41       31/hr
```

## Station Load

```text
BAR
████████░░  8 Orders

KITCHEN
████░░░░░░  4 Orders

BAKERY
██░░░░░░░░  2 Orders
```

---

# 26. KPI

- Order Waiting Time
- Payment Waiting Time
- Kitchen Preparation Time
- Order Lead Time
- Orders / Hour
- Sales / Hour
- Average Order Value
- Cash / QR Ratio
- Cancellation Rate
- Payment Review Rate
- Station Load
- Station Utilization
- Completed Orders
- Ready Orders

---

# 27. Daily / Shift Closing

ควรแยก:

## Shift Closing
```text
SHIFT #20260919-01

Opened
08:00

Closed
16:00
```

## Summary
```text
Cash Sales          8,450
QR Sales           12,750

Total Sales        21,200

Cancelled             350
Refund                 120

Orders                 173
```

## Cash Control

```text
Opening Cash       2,000
Cash Sales         8,450

Expected Cash     10,450

Actual Cash       10,400

Difference           -50
```

---

# 28. CSV Export

อย่างน้อย:

- orders.csv
- order_items.csv
- payments.csv
- daily_closing.csv

## orders.csv

```text
order_no
order_datetime
kiosk
cashier
payment_type
subtotal
discount
total
status
```

## order_items.csv

```text
order_no
product
qty
sweetness
temperature
separate_ice
station
price
```

---

# 29. User Roles

- ADMIN
- MANAGER
- CASHIER
- KITCHEN
- VIEWER

| Function | Admin | Manager | Cashier | Kitchen |
|---|---:|---:|---:|---:|
| Menu | ✓ | ✓ | - | - |
| Price | ✓ | ✓ | - | - |
| Receive Payment | ✓ | ✓ | ✓ | - |
| Payment Override | ✓ | ✓ | Limited | - |
| Kitchen | ✓ | ✓ | - | ✓ |
| Report | ✓ | ✓ | Limited | - |
| Close Shift | ✓ | ✓ | ✓ | - |
| User Management | ✓ | - | - | - |

---

# 30. Device Management

Admin เห็น:

```text
KIOSK-01
Online
192.168.1.21

KIOSK-02
Online
192.168.1.22

CASHIER-01
Online

BAR-KDS
Online

DISPLAY-01
Offline
```

ควรมี Heartbeat ทุก 10–30 วินาที

เก็บ:
- device_id
- device_type
- device_name
- IP
- assigned_station
- assigned_cashier
- last_seen
- status

---

# 31. Voice & Sound Notification

Critical Voice Prompts:

- “เลือกเมนูที่ต้องการได้เลยค่ะ”
- “กรุณาเลือกวิธีชำระเงิน”
- “กรุณาสแกน QR Code เพื่อชำระเงิน”
- “กรุณารอสักครู่ พนักงานกำลังมารับชำระเงิน”
- “รับรายการเรียบร้อย กรุณารอหมายเลขออเดอร์ของท่าน”

Settings:
- Sound ON/OFF
- Volume
- Language
- Voice Profile

---

# 32. Design System — AndamanTech Style

แนวทาง:
- Clean
- White Space
- Dark Text
- Green Accent
- Operational UI
- Large Touch Targets
- Minimal Decoration
- Information First

## Suggested Colors

```text
Primary Background
#FFFFFF

Dark Text
#17211C

Andaman Green
#1E8F5A

Soft Green
#EAF6EF

Light Surface
#F7F9F8

Border
#DFE6E2

Warning
Amber

Critical
Red
```

---

# 33. Typography

แนะนำ:
- Noto Sans Thai
- IBM Plex Sans Thai
- Prompt

Hierarchy:
- H1: Bold / Semi Bold
- H2: Semi Bold
- H3: Medium
- Body: Regular
- Numeric KPI: Medium / Bold

---

# 34. UI Components

## Card

```text
┌──────────────────────────────┐
│ ORDER A105                   │
│                              │
│ Thai Tea × 2                 │
│ Sweetness 25%                │
│                              │
│ Waiting 04:21                │
│                              │
│ [ READY ]                    │
└──────────────────────────────┘
```

Style:
- Radius 12–16 px
- Border 1 px
- Soft shadow
- Clear spacing

---

# 35. Kiosk UI

```text
┌──────────────────────────────────────────┐
│ CAFE FLOW                        TH | EN │
├──────────────┬───────────────────────────┤
│ Coffee       │                           │
│ Tea          │    PRODUCT GRID           │
│ Smoothie     │                           │
│ Bakery       │ [IMAGE] [IMAGE] [IMAGE]  │
│ Food         │                           │
│              │ [IMAGE] [IMAGE] [IMAGE]  │
│              │                           │
├──────────────┴───────────────────────────┤
│ Order 3 items              ฿210          │
│                         [ ดูตะกร้า ]     │
└──────────────────────────────────────────┘
```

UX Principle:
- Large Product Card
- Large Image
- Category Sidebar
- Sticky Cart
- Large CTA
- Minimal Steps

---

# 36. Customer Display UI

```text
60% ORDER STATUS
40% MEDIA / PROMOTION
```

ควรมี:
- Preparing
- Ready
- Flash Highlight
- Voice Queue
- Sound Queue Protection

---

# 37. Functions Recommended for V1

ควรมีตั้งแต่ Phase แรก:

1. Sold Out / Pause Product
2. Order Recall / Reprint
3. Cancellation / Void
4. Refund Record
5. Shift Management
6. Device Monitoring
7. Duplicate Payment Detection
8. Kitchen SLA Timer
9. Time-based Menu Availability
10. Offline / Recovery Queue

---

# 38. V1 Scope

```text
V1
│
├── Menu
├── Product Image
├── Product Modifier
├── Kiosk Ordering
├── Cash Payment
├── QR Payment
├── Slip OCR
├── Cashier
├── Kitchen Routing
├── Kitchen Printer
├── Kitchen Display
├── Customer Queue Display
├── Advertising
├── User / Role
├── Order Management
├── Shift Closing
├── Daily Closing
├── CSV Export
├── Device Management
└── Local Network
```

---

# 39. Out of Scope — V1

ยังไม่รวม:
- Inventory
- Recipe
- Ingredient Cost
- Purchasing
- Supplier
- Stock Replenishment
- Accounting Integration
- Membership
- CRM
- Loyalty
- Multi-Branch

---

# 40. Product Module Naming

## Platform
**CafeFlow**

## Modules

### CafeFlow Order
Self-Service Ordering

### CafeFlow Pay
Cash / QR / Slip Verification

### CafeFlow Cashier
Cashier Workstation

### CafeFlow Kitchen
Kitchen Routing / Kitchen Display / Printer

### CafeFlow Queue
Order Status / Pickup Display

### CafeFlow Media
Digital Signage / Promotion

### CafeFlow Manager
Operation Control Center

### CafeFlow Analytics
Sales / KPI / Process Monitoring

### CafeFlow Close
Shift & Daily Closing

---

# 41. Recommended Deployment

```text
Local Mini PC / Server

├── FastAPI
├── PostgreSQL
├── WebSocket
├── OCR Service
├── Media Service
└── Reporting Service
```

Clients:
```text
Kiosk Browser
Cashier Browser
Kitchen Browser
Manager Browser
Customer Display Browser
```

---

# 42. Deployment Principle

- Local-first
- Internet-independent where possible
- Browser-based
- Role-based
- Device-aware
- Modular
- Recovery-safe
- Easy to maintain

---

# 43. Roadmap

## Phase 1
- Ordering
- Payment
- Kitchen
- Queue
- Closing

## Phase 2
- Recipe
- Raw Material
- Inventory
- Stock Deduction
- Cost

## Phase 3
- Membership
- Promotion
- Coupon
- CRM

## Phase 4
- Multi-Branch
- Cloud Dashboard
- Central Menu
- Central Promotion
- Advanced Analytics

---

# 44. System Design Principles

## Flow First
ออกแบบจาก Workflow จริงก่อนเลือกหน้าจอหรือ Hardware

## One Order, One Journey
Order เดียวติดตามได้ตั้งแต่ Kiosk ถึง Pickup

## Verify Before Forward
ต้องยืนยัน Payment ก่อนส่งเข้า Production

## Visible Operations
ผู้จัดการเห็น Queue, Bottleneck และ KPI แบบ Real-time

## Modular & Expandable
Kiosk, Payment, Cashier, Kitchen, Display และ Analytics แยกเป็น Module แต่ใช้ Core Platform เดียวกัน

---

# 45. Recommended Next Design Artifacts

เอกสารที่ควรทำต่อจาก System Design นี้:

1. Database ER Diagram
2. API Specification
3. Screen Flow
4. Wireframe
5. UI Component Library
6. Device Assignment Matrix
7. Order State Machine
8. Payment State Machine
9. Kitchen Routing Flow
10. Deployment Diagram
11. Network Diagram
12. Test Scenario / UAT
13. Error Handling Specification
14. Backup / Recovery Plan
15. Hardware BOM

---

# 46. Summary

CafeFlow ถูกออกแบบให้เป็นมากกว่าระบบ POS แต่เป็น **Smart Cafe Operations Platform** ที่บริหารเส้นทางการทำงานตั้งแต่ Order → Payment → Production → Pickup → Closing

สถาปัตยกรรมเน้น:
- Python-based backend
- Modern lightweight web UI
- Local network
- Multi-Kiosk
- Cash / QR Payment
- Slip OCR
- Kitchen Routing
- KDS / Printer
- Customer Queue Display
- Advertising
- Manager Dashboard
- Closing Report
- CSV Export
- Role & Device Management

แนวทางนี้ทำให้ระบบสามารถเริ่มจากร้านเดียวและขยายไปสู่ Inventory, CRM, Multi-Branch และ Cloud Management ได้ภายหลัง โดยไม่จำเป็นต้องรื้อ Core Architecture ใหม่
