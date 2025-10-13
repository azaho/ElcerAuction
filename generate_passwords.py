import hashlib
import string
import yaml
import random
import time

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

# Step 1: Generate passwords for each company
passwords_by_company = {}
all_hashes = []

for company in COMPANIES:
    # Generate passwords
    passwords = [generate_password() for _ in range(PASSWORDS_PER_COMPANY)]
    passwords_by_company[company] = passwords
    
    # Hash each password
    hashes = [hash_password(pwd) for pwd in passwords]
    all_hashes.extend(hashes)

# Step 2: Shuffle all hashes
random.shuffle(all_hashes)

# Step 3: Save to files
with open('passwords.yml', 'w') as f:
    yaml.dump(passwords_by_company, f, default_flow_style=False, sort_keys=False)

with open('hashes.yml', 'w') as f:
    yaml.dump(all_hashes, f, default_flow_style=False)

# Done!
print(f"✓ Generated {len(all_hashes)} passwords for {len(COMPANIES)} companies")
print(f"✓ Saved to passwords.yml and hashes.yml")
print(f"✓ Random seed: {SEED}")