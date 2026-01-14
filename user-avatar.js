/**
 * User Avatar Handler
 * Updates all user icons with profile photos from Firestore
 */

/**
 * Update user avatar icons with profile photo
 * Replaces fa-user-circle icons with actual profile images
 */
async function updateUserAvatars() {
    try {
        // Wait for Firebase to be ready
        let attempts = 0;
        while (!window.firebaseAuth || !window.firebaseGetUserFromFirestore || !window.getCurrentUserUID) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
            if (attempts > 100) {
                return; // Timeout after 10 seconds
            }
        }

        // Wait for auth check to complete
        if (window.waitForAuthCheck) {
            await window.waitForAuthCheck();
        }

        // Get current user UID
        const userId = window.getCurrentUserUID();
        if (!userId) {
            return; // No user logged in
        }

        // Get user data from Firestore
        let userData = await window.firebaseGetUserFromFirestore(userId);
        
        // Fallback to Auth data if Firestore data not available
        if (!userData) {
            const authUser = window.firebaseAuth.currentUser;
            if (authUser) {
                userData = {
                    photoURL: authUser.photoURL,
                    displayName: authUser.displayName,
                    email: authUser.email
                };
            }
        }

        // Get photo URL
        const photoURL = userData?.photoURL || window.currentUserPhotoURL;
        
        if (!photoURL) {
            return; // No photo available, keep default icon
        }

        // Find all user icons in headers
        const userIcons = document.querySelectorAll('.user-info i.fa-user-circle, .header-actions .user-info i.fa-user-circle, .header-actions a.user-info i.fa-user-circle');
        
        userIcons.forEach((icon) => {
            const parentLink = icon.closest('.user-info');
            if (!parentLink) return;

            // Check if already replaced
            if (parentLink.querySelector('img.user-avatar-img')) {
                // Update existing image src in case photo changed
                const existingImg = parentLink.querySelector('img.user-avatar-img');
                if (existingImg.src !== photoURL) {
                    existingImg.src = photoURL;
                }
                return;
            }

            // Create image element
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = 'User Avatar';
            img.className = 'user-avatar-img';
            
            // Handle image load error - fallback to icon
            img.onerror = () => {
                img.style.display = 'none';
                icon.style.display = 'block';
            };
            
            img.onload = () => {
                icon.style.display = 'none';
                img.style.display = 'block';
            };

            // Hide icon initially, show image
            icon.style.display = 'none';
            parentLink.appendChild(img);
            
            // Ensure parent has proper styling
            if (!parentLink.style.position) {
                parentLink.style.position = 'relative';
            }
            if (!parentLink.style.overflow) {
                parentLink.style.overflow = 'hidden';
            }
            if (!parentLink.style.borderRadius) {
                parentLink.style.borderRadius = '50%';
            }
        });

    } catch (error) {
        console.error('Error updating user avatars:', error);
    }
}

// Export function globally
window.updateUserAvatars = updateUserAvatars;

// Auto-update avatars when auth check is complete
window.addEventListener('authCheckComplete', () => {
    updateUserAvatars();
});

// Also try to update when page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        updateUserAvatars();
    }, 1000);
});

