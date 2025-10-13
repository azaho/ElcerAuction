// ============================================================================
// FIREBASE IMPORTS & CONFIGURATION
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc,
    setDoc,
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

// Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyAx6u-5qO_M35rmgdc_N1YTf2LppPtIRpY",
    authDomain: "elcer-auction.firebaseapp.com",
    projectId: "elcer-auction",
    storageBucket: "elcer-auction.firebasestorage.app",
    messagingSenderId: "973241407405",
    appId: "1:973241407405:web:8abad73a76fbf99da17324"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// ============================================================================
// PASSWORD VALIDATION SETUP
// ============================================================================

// URL to the YAML file containing SHA-256 hashes of valid passwords
const HASHES_URL = 'https://azaho.github.io/ElcerAuction/hashes.yml';

// Array to store valid password hashes loaded from YAML
let validPasswordHashes = [];

// Track which passwords have already been used (one-time use only)
const usedPasswords = new Set();

// Track the current highest bid amount for UI feedback
let currentHighestBid = 0;


// ============================================================================
// LOAD JS-YAML LIBRARY & PASSWORD HASHES
// ============================================================================

// Dynamically load js-yaml library from CDN
const jsYamlScript = document.createElement('script');
jsYamlScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js';
document.head.appendChild(jsYamlScript);

// Once js-yaml loads, fetch and parse the password hashes
jsYamlScript.onload = () => {
    fetch(HASHES_URL)
        .then(response => response.text())
        .then(text => {
            validPasswordHashes = jsyaml.load(text);
            console.log(`Loaded ${validPasswordHashes.length} valid password hashes from YAML`);
        })
        .catch(error => {
            console.error('Error loading password hashes:', error);
            showMessage('Error loading password validation data', 'error');
        });
};


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Hash a string using SHA-256
 * @param {string} message - The text to hash
 * @returns {Promise<string>} - Hex string of the hash
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Display a temporary message to the user
 * @param {string} text - Message to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}


// ============================================================================
// BID SUBMISSION HANDLER
// ============================================================================

document.getElementById('bidForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form values
    const amount = parseInt(document.getElementById('amount').value);
    const password = document.getElementById('password').value;

    // Validate all fields are filled
    if (!amount || !password) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    // Validate amount is an integer
    if (!Number.isInteger(amount) || amount < 1) {
        showMessage('Bid amount must be a whole number', 'error');
        return;
    }

    // Client-side validation: Check if bid is higher than current highest
    if (currentHighestBid > 0 && amount < currentHighestBid + 1) {
        showMessage(`Bid must be higher or equal to $${currentHighestBid+1}M`, 'error');
        return;
    }

    // Hash the entered password
    const hash = await sha256(password);
    
    // Check if password hash exists in valid hashes list
    if (!validPasswordHashes.includes(hash)) {
        showMessage('Invalid password', 'error');
        return;
    }

    try {
        // Submit bid to Firestore - server-side rules will enforce validation
        await setDoc(doc(db, 'bids', password), {
            amount: amount,
            password: password,
            timestamp: serverTimestamp()
        });

        // Update the auction state with the new highest bid
        // Note: This happens after bid creation, so there's a brief moment where they're out of sync
        // But the Firestore rules ensure bids are still validated properly
        if (amount > currentHighestBid) {
            await setDoc(doc(db, 'auction', 'state'), {
                highestBid: amount,
                highestBidPassword: password,
                lastUpdated: serverTimestamp()
            }, { merge: true });
        }

        showMessage('Bid submitted successfully!', 'success');
        
        // Clear the form
        document.getElementById('bidForm').reset();
        
    } catch (error) {
        console.error('Error submitting bid:', error);
        
        // Handle specific error cases with user-friendly messages
        if (error.code === 'permission-denied') {
            // Permission denied usually means the bid didn't meet server-side requirements
            showMessage(`Permission denied. Your bid must be higher than $${currentHighestBid+1}M`, 'error');
        } else {
            showMessage('Error submitting bid: ' + error.message, 'error');
        }
    }
});


// ============================================================================
// REAL-TIME BID DISPLAY
// ============================================================================

// Query all bids ordered by submission time (oldest first)
const q = query(collection(db, 'bids'), orderBy('timestamp', 'asc'));

// Listen for real-time updates to the bids collection
onSnapshot(q, async (snapshot) => {
    const bidsDiv = document.getElementById('bids');
    const validBids = [];
    
    // Reset used passwords for fresh calculation each time
    usedPasswords.clear();

    // Process each bid document from Firestore
    for (const doc of snapshot.docs) {
        const bid = doc.data();
        
        // Skip if timestamp is not yet set by server
        if (!bid.timestamp) {
            continue;
        }
        
        // Hash the stored password
        const hash = await sha256(bid.password);

        // Accept bid only if:
        // 1. Password hash is in the valid list
        // 2. Password hasn't been used by an earlier bid
        if (validPasswordHashes.includes(hash) && !usedPasswords.has(bid.password)) {
            usedPasswords.add(bid.password);
            validBids.push(bid);
        }
    }

    // Sort valid bids by amount (highest to lowest)
    validBids.sort((a, b) => b.amount - a.amount);

    // Update the current highest bid amount for client-side validation
    currentHighestBid = validBids.length > 0 ? validBids[0].amount : 0;

    // Display the bids
    let bidsHTML = '';
    
    if (validBids.length === 0) {
        // Show only the starting price when there are no bids
        bidsHTML = `
            <div class="bid starting-price-bid">
                <div class="bid-info">
                    <strong>Starting Price</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        Minimum bid amount
                    </div>
                </div>
                <div class="bid-amount">$325M</div>
            </div>
        `;
    } else {
        // Show all valid bids
        bidsHTML = validBids.map((bid, index) => `
            <div class="bid ${index === 0 ? 'highest-bid' : ''}">
                <div class="bid-info">
                    <strong>${bid.password} (Pearl Equity / US-IND / Euro EKV / Ruby Fibre)</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        ${bid.timestamp.toDate().toLocaleString()}
                    </div>
                </div>
                <div class="bid-amount">$${bid.amount}M</div>
            </div>
        `).join('');
        
        // Add starting price at the bottom
        bidsHTML += `
            <div class="bid starting-price-bid">
                <div class="bid-info">
                    <strong>Starting Price</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        Minimum bid amount
                    </div>
                </div>
                <div class="bid-amount">$325M</div>
            </div>
        `;
    }
    
    bidsDiv.innerHTML = bidsHTML;
});
