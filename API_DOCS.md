# API Documentation

**Base URL:** `https://tech-to-customer-isp.vercel.app`  
**Fastify Server:** `http://localhost:3001` (development)

---

## Table of Contents

- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Auth Routes](#auth-routes)
- [Jobs](#jobs)
- [Employees](#employees)
- [Customers](#customers)
- [ETA](#eta)
- [Time Tracking](#time-tracking)
- [Dispatch & Overrides](#dispatch--overrides)
- [Forecasting](#forecasting)
- [Financing](#financing)
- [Maintenance Agreements](#maintenance-agreements)
- [Purchase Orders](#purchase-orders)
- [Regions](#regions)
- [Email Marketing](#email-marketing)
- [Verification](#verification)

---

## Authentication

All routes (except public ETA endpoints and `/api/auth/login`) require a Bearer token.

```
Authorization: Bearer <token>
```

Tokens are JWTs signed with `JWT_SECRET`, valid for **24 hours**. The payload includes:

```json
{
  "id": "uuid",
  "role": "owner | admin | employee | dev",
  "companyId": "uuid"
}
```

The `dev` role bypasses company-scoped access checks and can query across all companies. All other roles are scoped to their `companyId`.

---

## Error Handling

All errors return JSON with consistent fields:

```json
{
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "action": "Suggested action for the user"
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `MISSING_REQUIRED_FIELD` | 400 | Required field absent or null |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient role or wrong company |
| `NOT_FOUND` | 404 | Resource does not exist |
| `INVALID_JOB_STATUS` | 400 | Invalid status transition |
| `TECH_NOT_AVAILABLE` | 409 | Tech is unavailable or at capacity |
| `JOB_ALREADY_ASSIGNED` | 409 | Job already has a tech assigned |
| `DATABASE_ERROR` | 500 | Database query failed |
| `SERVER_ERROR` | 500 | Unexpected internal error |

### Rate Limiting

Routes are rate-limited per IP. When exceeded, the response is:

```
HTTP 429 Too Many Requests
Retry-After: <seconds>
```

---

## Auth Routes

### POST `/api/auth/login`

Authenticate and receive a JWT.

**Request Body**

```json
{
  "email": "tech@company.com",
  "password": "your-password"
}
```

**Response `200`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "tech@company.com",
    "role": "admin",
    "companyId": "uuid",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Errors:** `400` missing fields · `401` invalid credentials · `500` server error

---

## Jobs

### GET `/api/jobs`

List jobs for the authenticated user's company.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `unassigned`, `assigned`, `in_progress`, `completed`, `cancelled` |
| `priority` | string | Filter by priority |
| `limit` | number | Max results (default: 50, max: 200) |
| `offset` | number | Pagination offset (default: 0) |

**Response `200`**

```json
{
  "jobs": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "customerName": "Jane Doe",
      "address": "123 Main St, Dallas, TX 75001",
      "phone": "2145550101",
      "jobType": "ac_repair",
      "status": "unassigned",
      "priority": "normal",
      "assignedTechId": null,
      "scheduledTime": "2024-06-15T14:00:00Z",
      "initialNotes": "Unit not cooling",
      "completionNotes": null,
      "createdAt": "2024-06-14T10:00:00Z",
      "completedAt": null
    }
  ]
}
```

---

### POST `/api/jobs`

Create a new job.

**Request Body**

```json
{
  "companyId": "uuid",
  "customerName": "Jane Doe",
  "address": "123 Main St, Dallas, TX 75001",
  "phone": "2145550101",
  "jobType": "ac_repair",
  "priority": "normal",
  "scheduledTime": "2024-06-15T14:00:00Z",
  "initialNotes": "Unit not cooling"
}
```

**Required:** `companyId`, `customerName`, `address`, `phone`, `jobType`, `priority`

**Response `201`**

```json
{
  "jobId": "uuid",
  "job": { /* JobDTO */ }
}
```

---

### PATCH `/api/jobs/:id/assign`

Assign a technician to a job.

**Request Body**

```json
{
  "techId": "uuid"
}
```

**Response `200`**

```json
{
  "success": true,
  "updatedJob": { /* JobDTO */ }
}
```

**Errors:** `404` job not found · `409` already assigned or tech unavailable

---

### PATCH `/api/jobs/:id/status`

Update job status.

**Request Body**

```json
{
  "status": "in_progress",
  "completionNotes": "Replaced capacitor"
}
```

**Valid statuses:** `unassigned` → `assigned` → `in_progress` → `completed` · `cancelled` (any stage)

**Response `200`**

```json
{
  "success": true,
  "updatedJob": { /* JobDTO */ }
}
```

---

## Employees

### GET `/api/employees`

List all employees for the company.

**Response `200`**

```json
{
  "employees": [
    {
      "id": "uuid",
      "userId": "uuid",
      "companyId": "uuid",
      "name": "John Smith",
      "email": "john@company.com",
      "role": "technician",
      "skills": ["ac_repair", "heating"],
      "skillLevel": { "ac_repair": 4, "heating": 3 },
      "homeAddress": "456 Oak Ave, Dallas, TX",
      "phone": "2145550102",
      "isAvailable": true,
      "availabilityUpdatedAt": "2024-06-14T08:00:00Z",
      "currentJobId": null,
      "maxConcurrentJobs": 3,
      "isActive": true,
      "rating": 4.7,
      "lastJobCompletedAt": "2024-06-13T17:00:00Z",
      "latitude": 32.7767,
      "longitude": -96.797,
      "locationUpdatedAt": "2024-06-14T09:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-06-14T09:00:00Z"
    }
  ]
}
```

---

### GET `/api/employees/available`

Get techs that are currently available for dispatch.

**Response `200`**

```json
{
  "employees": [ /* same shape as above, filtered to isAvailable: true */ ]
}
```

---

### GET `/api/employees/:id`

Get a single employee by ID.

**Response `200`**

```json
{
  "employee": { /* EmployeeDTO */ }
}
```

**Errors:** `404` not found

---

### POST `/api/employees`

Create an employee.

**Request Body**

```json
{
  "userId": "uuid",
  "name": "John Smith",
  "homeAddress": "456 Oak Ave, Dallas, TX",
  "skills": ["ac_repair", "heating"],
  "skillLevel": { "ac_repair": 4 },
  "email": "john@company.com",
  "phone": "2145550102",
  "role": "technician",
  "maxConcurrentJobs": 3,
  "internalNotes": "Prefers morning shifts"
}
```

**Required:** `userId`, `name`, `homeAddress`, `skills` (at least one)

**Response `201`**

```json
{
  "employee": { /* EmployeeDTO */ }
}
```

---

### PATCH `/api/employees/:id`

Update employee details, availability, or location.

**Request Body** *(all fields optional, at least one required)*

```json
{
  "name": "John Smith",
  "isAvailable": false,
  "latitude": 32.7767,
  "longitude": -96.797,
  "skills": ["ac_repair", "heating", "refrigeration"],
  "maxConcurrentJobs": 4
}
```

**Response `200`**

```json
{
  "employee": { /* EmployeeDTO */ }
}
```

---

### PATCH `/api/employees/:id/availability`

Toggle a tech's availability on/off.

**Request Body**

```json
{
  "isAvailable": false
}
```

**Response `200`**

```json
{
  "success": true,
  "profile": { /* EmployeeDTO */ }
}
```

---

## Customers

### GET `/customers`

List customers with optional filters.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `customerType` | string | `residential` or `commercial` |
| `zip` | string | Filter by zip code |
| `isActive` | boolean | Active/inactive filter |
| `search` | string | Full-text search on name, email, phone |
| `branchId` | uuid | Filter by branch |
| `limit` | number | Default 50, max 100 |
| `offset` | number | Default 0 |

**Response `200`**

```json
{
  "customers": [
    {
      "id": "uuid",
      "firstName": "Jane",
      "lastName": "Doe",
      "companyName": null,
      "customerType": "residential",
      "email": "jane@example.com",
      "phone": "2145550101",
      "address": "123 Main St",
      "city": "Dallas",
      "state": "TX",
      "zip": "75001",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

---

### POST `/customers`

Create a customer.

**Request Body**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "2145550101",
  "address": "123 Main St",
  "city": "Dallas",
  "state": "TX",
  "zip": "75001",
  "customerType": "residential",
  "email": "jane@example.com",
  "branchId": "uuid"
}
```

**Required:** `firstName`, `lastName`, `phone`, `address`, `city`, `state`, `zip`

---

### GET `/customers/:customerId`

Get a single customer with their locations and equipment.

---

### PATCH `/customers/:customerId`

Update customer details. All fields optional, at least one required.

---

### POST `/customers/:customerId/locations`

Add a service location for a customer.

**Request Body**

```json
{
  "address": "789 Oak Ave",
  "city": "Dallas",
  "state": "TX",
  "zip": "75002",
  "label": "Rental property",
  "accessNotes": "Gate code 1234",
  "hasPets": true,
  "isPrimary": false
}
```

---

### POST `/customers/:customerId/equipment`

Add equipment to a customer's record.

**Request Body**

```json
{
  "equipmentType": "ac",
  "manufacturer": "Carrier",
  "modelNumber": "24ACC636A003",
  "serialNumber": "1234ABCD",
  "installDate": "2019-05-01",
  "locationId": "uuid"
}
```

**Valid equipment types:** `furnace`, `ac`, `heat_pump`, `air_handler`, `thermostat`, `water_heater`, `boiler`, `mini_split`, `package_unit`, `hvac_unit`, `other`

---

## ETA

### POST `/eta/token`

Generate a short-lived ETA link for a customer. Requires admin or dispatch role.

**Request Body**

```json
{
  "jobId": "uuid",
  "expiresInMinutes": 120
}
```

`expiresInMinutes` range: 30–1440 (default: 120). One token per job — calling again replaces the existing token.

**Response `200`**

```json
{
  "token": "abc123...",
  "expiresAt": "2024-06-15T16:00:00Z",
  "etaUrl": "/eta/abc123..."
}
```

---

### GET `/eta/:token` *(Public — no auth required)*

Customer-facing endpoint. Returns the tech's current ETA and location for a job.

**Response `200`**

```json
{
  "jobId": "uuid",
  "etaMinutes": 12,
  "techLatitude": 32.79,
  "techLongitude": -96.80,
  "note": "On my way, slight traffic on I-35",
  "updatedAt": "2024-06-15T13:48:00Z"
}
```

**Errors:** `404` invalid or expired token · `410` token has expired

---

### PATCH `/eta/update`

Tech updates their ETA and location (called from the tech's device).

**Request Body**

```json
{
  "jobId": "uuid",
  "etaMinutes": 12,
  "techLatitude": 32.79,
  "techLongitude": -96.80,
  "note": "On my way"
}
```

`etaMinutes` range: 0–480

---

## Time Tracking

### GET `/jobs/:jobId/time-tracking`

Get time tracking checkpoints and computed durations for a job.

**Response `200`**

```json
{
  "tracking": {
    "jobId": "uuid",
    "departedAt": "2024-06-15T13:00:00Z",
    "arrivedAt": "2024-06-15T13:20:00Z",
    "workStartedAt": "2024-06-15T13:25:00Z",
    "workEndedAt": "2024-06-15T14:45:00Z",
    "departedJobAt": "2024-06-15T14:50:00Z",
    "driveMinutes": 20,
    "wrenchMinutes": 80,
    "actualDurationMinutes": 90
  }
}
```

---

### PATCH `/jobs/:jobId/time-tracking`

Update time tracking checkpoints.

**Request Body** *(include only the checkpoint being recorded)*

```json
{
  "departedAt": "2024-06-15T13:00:00Z",
  "arrivedAt": "2024-06-15T13:20:00Z",
  "workStartedAt": "2024-06-15T13:25:00Z",
  "workEndedAt": "2024-06-15T14:45:00Z",
  "departedJobAt": "2024-06-15T14:50:00Z"
}
```

Computed durations (`driveMinutes`, `wrenchMinutes`, `actualDurationMinutes`) are calculated automatically and synced to `job_completions`.

---

## Dispatch & Overrides

### POST `/jobs/:jobId/dispatch-override`

Log when a dispatcher manually overrides the algorithm's recommendation.

**Request Body**

```json
{
  "overrideTechId": "uuid",
  "originalTechId": "uuid",
  "reason": "Customer requested this tech specifically",
  "algorithmScore": 87.5
}
```

**Required:** `overrideTechId`, `reason`

---

### GET `/jobs/:jobId/dispatch-override`

Get the override log for a specific job.

---

### POST `/jobs/:jobId/reassign`

Reassign a job to a different tech and log the reason.

**Request Body**

```json
{
  "newTechId": "uuid",
  "reason": "Original tech called out sick",
  "previousTechId": "uuid"
}
```

---

### GET `/jobs/:jobId/reassignments`

Get the full reassignment history for a job.

---

### GET `/analytics/dispatch-overrides`

Company-level report of manual dispatch overrides.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `days` | number | Lookback window in days (default: 30, max: 365) |

---

## Forecasting

### GET `/forecast/jobs`

Demand forecast based on historical job data.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `granularity` | string | `month` or `week` (default: `month`) |
| `horizon` | number | Periods to forecast (default: 6) |
| `jobType` | string | Filter to a specific job type |

**Response `200`**

```json
{
  "granularity": "month",
  "horizon": 6,
  "historicalDataPoints": 24,
  "totalHistoricalJobs": 1842,
  "overallMonthlyAverage": 153,
  "forecast": [
    {
      "period": "July 2024",
      "year": 2024,
      "month": 7,
      "predictedJobs": 198,
      "historicalAvg": 162,
      "multiplier": 1.22,
      "trend": "above_average"
    }
  ]
}
```

---

### GET `/forecast/seasonal-trends`

Year-over-year job volume analysis by month.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `years` | number | How many years of history to include (default: 3) |
| `jobType` | string | Optional job type filter |

**Response `200`**

```json
{
  "byYear": {
    "2023": [
      { "month": 1, "monthName": "January", "jobCount": 120, "completed": 115, "cancelled": 5 }
    ]
  },
  "insights": {
    "peakMonth": { "month": 7, "name": "July", "avgJobs": 198 },
    "slowMonth": { "month": 1, "name": "January", "avgJobs": 98 },
    "seasonalMultipliers": [ /* per-month multipliers */ ]
  }
}
```

---

### GET `/forecast/staffing`

Recommended technician headcount per upcoming month based on predicted demand.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `horizon` | number | Months ahead to forecast (default: 6) |
| `jobsPerTechPerDay` | number | Assumed capacity per tech (default: 4) |

**Response `200`**

```json
{
  "currentTechs": 8,
  "staffing": [
    {
      "period": "July 2024",
      "predictedJobs": 198,
      "techsNeeded": 10,
      "currentTechs": 8,
      "delta": 2,
      "recommendation": "Hire 2 more techs",
      "utilizationPct": 124
    }
  ]
}
```

---

### GET `/forecast/parts-demand`

Parts usage projection based on historical job patterns.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `horizon` | number | Months to forecast (default: 3) |

---

## Financing

### GET `/financing/calculator`

Estimate monthly payment without creating an application.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `principal` | number | Loan amount in dollars |
| `annualRatePct` | number | Annual interest rate (e.g. `9.9`) |
| `termMonths` | number | Loan term in months |

**Response `200`**

```json
{
  "monthlyPayment": 184.23,
  "totalPaid": 2210.76,
  "totalInterest": 210.76
}
```

---

### POST `/financing/applications`

Submit a financing application.

**Request Body**

```json
{
  "customerId": "uuid",
  "jobId": "uuid",
  "requestedAmount": 2000,
  "termMonths": 12,
  "annualRatePct": 9.9
}
```

---

### GET `/financing/applications`

List financing applications for the company.

---

### POST `/financing/applications/:id/approve`

Approve an application and automatically generate an amortized payment plan.

**Request Body**

```json
{
  "approvedAmount": 2000,
  "annualRatePct": 9.9,
  "termMonths": 12,
  "firstPaymentDate": "2024-07-01"
}
```

---

### POST `/financing/applications/:id/decline`

Decline with a reason.

**Request Body**

```json
{
  "reason": "Credit history insufficient"
}
```

---

### GET `/financing/plans/:id`

Get a payment plan with the full amortization schedule.

**Response `200`**

```json
{
  "plan": {
    "id": "uuid",
    "customerId": "uuid",
    "principal": 2000,
    "annualRatePct": 9.9,
    "termMonths": 12,
    "monthlyPayment": 175.65,
    "totalPaid": 2107.80,
    "paidToDate": 351.30,
    "remainingBalance": 1748.70,
    "status": "active"
  },
  "schedule": [
    {
      "paymentNumber": 1,
      "dueDate": "2024-07-01",
      "payment": 175.65,
      "principal": 159.20,
      "interest": 16.45,
      "balance": 1840.80,
      "status": "paid"
    }
  ]
}
```

---

### POST `/financing/plans/:id/record-payment`

Record a payment received.

**Request Body**

```json
{
  "amountPaid": 175.65,
  "paidAt": "2024-07-01"
}
```

---

### GET `/financing/overdue`

List all overdue payment plans for the company.

---

## Maintenance Agreements

### GET `/maintenance/tiers`

List available service plan tiers for the company.

**Response includes:** tier name, pricing (monthly/annual), included visits, discount percentage, priority dispatch flag, included services.

---

### POST `/maintenance/tiers`

Create a service plan tier. Admin only.

**Request Body**

```json
{
  "name": "Gold Plan",
  "priceAnnual": 299,
  "priceMonthly": 29.99,
  "billingCycle": "annual",
  "includedVisits": 2,
  "discountPercent": 15,
  "priorityDispatch": true,
  "includedServices": ["ac_tune_up", "heating_tune_up"]
}
```

---

### GET `/maintenance/agreements`

List maintenance agreements with optional status filter.

**Query Parameters:** `status` (`active`, `pending`, `expired`, `cancelled`, `suspended`), `customerId`, `limit`, `offset`

---

### POST `/maintenance/agreements`

Create a maintenance agreement for a customer.

**Request Body**

```json
{
  "customerId": "uuid",
  "tierId": "uuid",
  "billingCycle": "annual",
  "startsAt": "2024-07-01",
  "autoRenew": true,
  "branchId": "uuid"
}
```

---

### POST `/maintenance/agreements/:id/cancel`

Cancel an agreement.

**Request Body**

```json
{
  "reason": "Customer requested cancellation"
}
```

---

## Purchase Orders

### GET `/purchase-orders`

List purchase orders.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `draft`, `submitted`, `approved`, `partially_received`, `received`, `cancelled` |
| `vendorName` | string | Filter by vendor |
| `branchId` | uuid | Filter by branch |
| `since` | date | Filter by creation date (`YYYY-MM-DD`) |
| `limit` | number | Default 50, max 200 |
| `offset` | number | Default 0 |

---

### POST `/purchase-orders`

Create a purchase order.

**Request Body**

```json
{
  "vendorName": "HVAC Supply Co.",
  "vendorEmail": "orders@hvacsupply.com",
  "vendorPhone": "8005550100",
  "expectedDelivery": "2024-06-20",
  "shippingAddress": "100 Warehouse Blvd, Dallas, TX 75001",
  "notes": "Urgent — summer inventory",
  "lineItems": [
    {
      "partNumber": "CAP-35-5-440",
      "description": "Dual Run Capacitor 35+5 MFD 440V",
      "quantity": 10,
      "unitCost": 12.50,
      "unit": "each"
    }
  ]
}
```

---

### PATCH `/purchase-orders/:id`

Update a PO. Only allowed while status is `draft` or `submitted`.

---

### POST `/purchase-orders/:id/receive`

Record received items against a PO.

**Request Body**

```json
{
  "receivedBy": "John Smith",
  "receivedAt": "2024-06-20",
  "deliveryNote": "DN-4892",
  "lines": [
    {
      "poLineItemId": "uuid",
      "quantityReceived": 10,
      "notes": "All items received in good condition"
    }
  ]
}
```

---

## Regions

### GET `/regions`

List all regions for the company.

---

### POST `/regions`

Create a region. Admin only.

**Request Body**

```json
{
  "name": "North Texas"
}
```

---

### DELETE `/regions/:id`

Delete a region. The region must have no branches assigned to it first.

---

### POST `/regions/:id/branches`

Assign a branch to a region.

**Request Body**

```json
{
  "branchId": "uuid"
}
```

---

### DELETE `/regions/:id/branches/:branchId`

Remove a branch from a region (does not delete the branch).

---

### GET `/regions/:id/analytics`

Rolled-up job volume, revenue, and technician stats across all branches in the region.

---

## Email Marketing

### GET `/email/templates`

List email templates for the company.

---

### POST `/email/templates`

Create an email template.

**Request Body**

```json
{
  "name": "Post-Job Follow-Up",
  "subject": "How did your service go?",
  "htmlBody": "<h1>Thanks for choosing us!</h1>...",
  "previewText": "We'd love your feedback",
  "category": "post_job"
}
```

**Template categories:** `post_job`, `estimate_followup`, `membership_renewal`, `seasonal_promo`, `review_request`, `invoice`, `appointment_reminder`, `win_back`, `other`

**Template variables** use `{{variableName}}` syntax and are interpolated at send time.

---

### POST `/email/campaigns`

Create and send a campaign to a customer segment.

**Request Body**

```json
{
  "name": "Summer AC Tune-Up Promo",
  "templateId": "uuid",
  "fromName": "Dallas HVAC Co.",
  "fromEmail": "info@dallaishvac.com",
  "replyTo": "support@dallashvac.com",
  "segment": {
    "customerType": "residential",
    "hasJobInLastDays": 365,
    "hasActiveMembership": false,
    "zipCodes": ["75001", "75002"]
  }
}
```

---

## Verification

### POST `/api/verify/request-code`

Request a 6-digit verification code be sent to the email on file. Called after a verification session is established.

**Request Body**

```json
{
  "verificationId": "uuid"
}
```

Requires the `vr` session cookie to be present. The code expires in 10 minutes. Rate limited per IP and per verification ID.

---

### POST `/api/verify/code`

Submit a verification code.

**Request Body**

```json
{
  "verificationId": "uuid",
  "code": "482910"
}
```

**Errors:**
- `403` missing or mismatched session cookie
- `404` invalid verification ID
- `409` already verified
- `410` token or code expired
- `429` too many attempts (max 5 per verification)