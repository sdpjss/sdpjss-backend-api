# SDPJSS Backend API

The backend module is the Express REST API used by the public frontend and admin
portal. It owns persistence, authentication, authorization, payments, email,
uploads, receipt identifiers, and business rules. For repository-wide setup, see
the [root README](../README.md).

## Technology

- Node.js with ES modules and Express
- MongoDB and Mongoose
- JSON Web Tokens and bcrypt
- Cloudinary and Multer
- Razorpay, Nodemailer, and Google reCAPTCHA
- Helmet and CORS

## Requirements

- Node.js `20.19+` or `22.12+` recommended for consistency with the web modules
- npm
- A MongoDB deployment accessible from the development machine
- Test credentials for integrations exercised locally

## Setup

From the repository root:

```bash
cd backend
npm ci
```

Create `backend/.env`:

```dotenv
# Server and database
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>
ALLOWED_CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# Authentication
JWT_SECRET=<long-random-access-token-secret>
REFRESH_SECRET=<different-long-random-refresh-token-secret>
ADMIN_EMAIL=<local-superadmin-email>
ADMIN_PASSWORD=<strong-local-superadmin-password>

# Cloudinary
CLOUDINARY_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_SECRET_KEY=<api-secret>

# Razorpay and reCAPTCHA
RAZORPAY_KEY_ID=<test-key-id>
RAZORPAY_KEY_SECRET=<test-key-secret>
CURRENCY=INR
RECAPTCHA_SECRET_KEY=<secret-key>

# Transactional email pool
EMAIL_USERS=<sender-one@example.com>,<sender-two@example.com>
EMAIL_PASSWORDS=<app-password-one>,<app-password-two>
EMAIL_FROM_NAME=SDPJSS
EMAIL_REPLY_TO=<reply-to@example.com>

# Contact form and legacy email flows
EMAIL_USER=<contact-sender@example.com>
EMAIL_PASSWORD=<email-app-password>
```

### Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `PORT` | Server | Optional; defaults to `4000` |
| `MONGODB_URI` | Startup | URI without the database name; `/sdpjss` is appended |
| `ALLOWED_CORS_ORIGINS` | Browser clients | Include exact frontend and admin origins |
| `JWT_SECRET` | Authentication | Signs user and admin access tokens |
| `REFRESH_SECRET` | Admin authentication | Must differ from `JWT_SECRET` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Superadmin login | Use local/test credentials during development |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET_KEY` | Uploads | Prefer a non-production account |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Donations | Use matching test-mode credentials |
| `CURRENCY` | Payments | Payment creation defaults to `INR` |
| `RECAPTCHA_SECRET_KEY` | Public forms | Must match the frontend site key |
| `EMAIL_USERS`, `EMAIL_PASSWORDS` | Transactional email | Matching comma-separated lists required during initialization |
| `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` | Transactional email | Display name and reply-to address |
| `EMAIL_USER`, `EMAIL_PASSWORD` | Contact/legacy email | Provider account and app password |

Never commit `.env`. Use test credentials locally and configure real values
through the deployment platform's secret manager.

## Run Locally

Development with automatic restart:

```bash
npm run server
```

Production-style startup:

```bash
npm start
```

The API defaults to `http://localhost:4000`. Check it with:

```bash
curl http://localhost:4000/
```

Expected response: `API WORKING`.

## Commands

| Command | Description |
| --- | --- |
| `npm run server` | Start with Nodemon and reload on source changes |
| `npm start` | Start with Node.js |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Apply safe ESLint fixes |
| `npm test` | Placeholder only; automated tests are not configured |

## Source Layout

```text
backend/
├── config/          # MongoDB and Cloudinary configuration
├── controllers/     # Request handlers and business rules
│   └── helpers/     # Receipt IDs, calculations, and controller helpers
├── middlewares/     # Authentication and upload middleware
├── models/          # Mongoose schemas
├── routes/          # Express route definitions
├── services/        # Shared services such as email delivery
├── public/          # Static files and upload staging
├── server.js        # Express entry point
└── eslint.config.js
```

## API Route Groups

| Prefix | Responsibility |
| --- | --- |
| `/api/user` | User authentication, profiles, donations, and submissions |
| `/api/admin` | Admin authentication and administrative operations |
| `/api/khandan` | Family-group operations |
| `/api/c` | Public/common operations, notices, and contact form |
| `/api/additional` | Guest users, guest donations, and related operations |
| `/api/todopages` | Administrative task pages |
| `/public` | Static files served by Express |

## Authentication and Authorization

- User access tokens are checked by user authentication middleware.
- Admin access tokens use the `atoken` request header.
- Regular admins use refresh tokens for access-token renewal.
- Superadmin credentials are configured through backend environment variables.
- Handlers must use identities and roles established by authentication
  middleware rather than trusting client-supplied IDs or roles.

Apply the appropriate authentication and role middleware when adding protected
routes.

## Data and Integrations

Mongoose models cover administrators, users, child members, families, donations,
guest donations, refunds, notices, teams, jobs, staff requirements,
advertisements, features, donation categories, courier charges, and task pages.

Integrations requiring secret keys must remain server-side. Only public payment
and reCAPTCHA identifiers may be passed to browser clients.

## Validation

```bash
npm run lint
node --check server.js
```

Automated tests are not configured. Manually exercise affected routes with
valid, invalid, unauthenticated, and unauthorized requests. Test payment, email,
upload, and OTP changes using sandbox services.

## Troubleshooting

### Server exits during startup

Check MongoDB connectivity and required email-pool variables. The email service
requires matching `EMAIL_USERS` and `EMAIL_PASSWORDS` lists during startup.

### Requests are rejected by CORS

Add the exact client origins to `ALLOWED_CORS_ORIGINS` and restart the server.
Local development normally uses ports `5173` and `5174`.

### MongoDB connection fails

Confirm credentials, network access rules, and URI format. The code appends
`/sdpjss`, so do not add a conflicting database path.

### Token verification fails

Confirm all running instances use the same current JWT secrets. Existing tokens
become invalid after rotation, so clients must log in again.

### Payment or email delivery fails

Do not mix test and live payment credentials. For email, use provider-approved
app passwords and ensure paired email lists have equal lengths.

## Security and Deployment

- Do not log or commit tokens, passwords, database URIs, or integration secrets.
- Restrict CORS origins to known deployments.
- Use different high-entropy access and refresh JWT secrets.
- Validate client input and enforce authorization on the server.
- Configure secrets in the hosting platform and run with `npm start` under a
  supervised process.
- Rotate any credential that has ever been committed; removing it from the
  current branch does not remove it from Git history.
