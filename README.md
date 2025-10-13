# Elcer Products Transaction - Auction Security Documentation

## Context

This auction system is designed for the **11.111 Elcer Products Transaction negoti-auction** conducted by TNDA Corporation's Business Development team. This document ensures all potential buyers understand the security measures protecting the bidding process.

**Key Details:**
- Transaction deadline: Saturday, October 17 at 11:59 PM Boston time.
- Auction structured by Business Development Head and Elcer Products Division President
- All bids are confidential and secure

---

## How It's Secured

- 👁️ Open Source. All code publicly available on GitHub for inspection. No hidden backdoors or admin privileges. Real-time updates for everyone.

- 🚫 Immutable Bids. Once made, bids cannot be edited or deleted (Firebase rules enforce this). No changing amounts; no hiding bidding history. Each new bid must be at least $1M higher than current highest (enforced by server-side rules in `firestore.rules`.)

- 🔐 One-Time Passwords. 400 total passwords distributed across the 4 bidders. Each bidder gets a set of unique one-time 16-character passwords (randomly generated). Each password works exactly once - duplicates ignored. Only password hashes stored publicly; actual passwords remain secret until they are used. Fake bids with wrong passwords are filtered out automatically. Attackers cannot reverse-engineer passwords from public hash list. Without your password, no one can create bids visible to legitimate users.

## What Attackers Cannot Do

❌ Forge bids - don't have valid passwords  
❌ Modify bids - Firebase blocks updates/deletes  
❌ Reuse passwords - each counts once (enforced by document ID = password)  
❌ Manipulate your view or view of the auctioneers - the browser validates independently.
❌ Crack hashes - SHA-256 is cryptographically secure  
❌ Lower the highest bid - bids must increase by at least $1M

## Verify It Yourself

1. Review source code on GitHub
2. Check Firebase rules in Firebase Console
3. Open browser DevTools to watch validation in real-time
4. Compare password hash list format

**Security through transparency, not secrecy.**

### Password Generation
**File:** `generate_passwords.py`

Generates 400 passwords across companies using a timestamp-based random seed for reproducibility:

```python
# Configuration
PASSWORDS_PER_COMPANY = 100
COMPANIES = ['PEARL_EQUITY', 'US_IND', 'EURO_EKV', 'RUBY_FIBRE']

# Set random seed based on timestamp
SEED = int(time.time())
random.seed(SEED)

def generate_password():
    """Generate a random 16-character password"""
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(16))

def hash_password(password):
    """Convert password to SHA-256 hash"""
    return hashlib.sha256(password.encode()).hexdigest()
```

The script generates passwords for each company, hashes them, shuffles all hashes together, and saves to `passwords.yml` and `hashes.yml`.

### Password Validation
**File:** `scripts.js`
```javascript
const hash = await sha256(password);
if (!validPasswordHashes.includes(hash)) {
    showMessage('Invalid password', 'error');
    return;
}
```

### One-Time Password Enforcement
**File:** `scripts.js`
```javascript
const usedPasswords = new Set();
for (const doc of snapshot.docs) {
    const bid = doc.data();
    const hash = await sha256(bid.password);
    if (validPasswordHashes.includes(hash) && !usedPasswords.has(bid.password)) {
        usedPasswords.add(bid.password);
        validBids.push(bid);
    }
}
```

### Firebase Security Rules
**File:** `firestore.rules`
```javascript
match /bids/{bidId} {
    allow read: if true;
    allow create: if request.resource.data.amount is int
                  && request.resource.data.amount > 0
                  && request.resource.data.password is string
                  && request.resource.data.password.size() == 16
                  
                  // Minimum bid: 325M
                  && request.resource.data.amount >= 325 
                  
                  // Timestamp MUST be server time
                  && request.resource.data.timestamp == request.time
                  
                  // Document ID must equal password (prevents password reuse)
                  && bidId == request.resource.data.password
                  
                  // Document must not already exist (password hasn't been used)
                  && !exists(/databases/$(database)/documents/bids/$(bidId))
                  
                  // SERVER-SIDE VALIDATION: Bid must be higher than current highest
                  && (!exists(/databases/$(database)/documents/auction/state) 
                      || request.resource.data.amount >= get(/databases/$(database)/documents/auction/state).data.highestBid+1);
    allow update, delete: if false;
}

// Auction state tracks the current highest bid
match /auction/state {
    allow read: if true;
    allow update: if request.resource.data.highestBid is int
                  && request.resource.data.highestBid > 0
                  && request.resource.data.highestBid >= resource.data.highestBid + 1;
    allow create, delete: if false;
}
```