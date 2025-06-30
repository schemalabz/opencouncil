/**
 * greek-name-geniki
 * 
 * Converts Greek names to genitive case (γενική πτώση)
 * Based on greek-name-klitiki by Christos Panagiotakopoulos
 */

/**
 * Checks if a syllable is accented
 * @param {string} string 
 * @returns {boolean}
 */
function isAccented(string: string): boolean {
    const accentedCharacters = ['ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ'];

    for (const char of accentedCharacters) {
        if (string.indexOf(char) > -1 || string.indexOf(char.toUpperCase()) > -1)
            return true;
    }

    return false;
}

/**
 * Simple syllable counting for accent categorization
 * (Simplified version without hyphenation library)
 */
function countVowelGroups(word: string): number {
    const vowels = 'αάεέηήιίοόυύωώΑΆΕΈΗΉΙΊΟΌΥΎΩΏ';
    let count = 0;
    let prevWasVowel = false;

    for (const char of word) {
        const isVowel = vowels.includes(char);
        if (isVowel && !prevWasVowel) {
            count++;
        }
        prevWasVowel = isVowel;
    }

    return count;
}

/**
 * Categorizes a word depending on which syllable is accented
 * @param {string} word 
 * @returns {string|false} - Returns 'LIG', 'PAR' or 'PRO' depending on where the accent is
 */
function accentCategorization(word: string): 'LIG' | 'PAR' | 'PRO' | false {
    // Find accented characters and their positions
    const accentedChars = ['ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ', 'Ά', 'Έ', 'Ή', 'Ί', 'Ό', 'Ύ', 'Ώ'];
    let accentPosition = -1;

    for (let i = 0; i < word.length; i++) {
        if (accentedChars.includes(word[i])) {
            accentPosition = i;
            break;
        }
    }

    // No accent found
    if (accentPosition === -1) return false;

    const syllableCount = countVowelGroups(word);
    const vowels = 'αάεέηήιίοόυύωώΑΆΕΈΗΉΙΊΟΌΥΎΩΏ';

    // Count vowel groups up to accent position
    let vowelGroupsBeforeAccent = 0;
    let prevWasVowel = false;

    for (let i = 0; i < accentPosition; i++) {
        const isVowel = vowels.includes(word[i]);
        if (isVowel && !prevWasVowel) {
            vowelGroupsBeforeAccent++;
        }
        prevWasVowel = isVowel;
    }

    const accentSyllable = vowelGroupsBeforeAccent + 1; // 1-indexed

    if (accentSyllable === syllableCount) return 'LIG';      // Last syllable (λήγουσα)
    if (accentSyllable === syllableCount - 1) return 'PAR';  // Second to last (παραλήγουσα)
    return 'PRO';                                            // Third from last or earlier (προπαραλήγουσα)
}

/**
 * Transforms a Greek name to its genitive form (γενική πτώση)
 * @example 
 * // returns "Χρήστου"
 * geniki("Χρήστος")
 * @param {string} word - The name to transform
 * @param {boolean} [onlyUppercase=true] - Only transform words that start with uppercase
 * @returns {string} - The genitive form of the name
 */
export function geniki(word: string, onlyUppercase: boolean = true): string {
    if (!(word[0].toUpperCase() === word[0]) && onlyUppercase) {
        console.log("Not a name (doesn't start with uppercase)");
        return word;
    }

    // Αρσενικά σε -ας (eg: Επαμεινώνδας → Επαμεινώνδα)
    if (word.endsWith('ας') || word.endsWith('άς')) {
        return word.slice(0, -2) + 'α';
    }

    // Αρσενικά σε -ης (eg: Αναστάσης → Αναστάση)  
    if (word.endsWith('ης') || word.endsWith('ής')) {
        return word.slice(0, -2) + 'η';
    }

    // Θηλυκά σε -α (eg: Μαρία → Μαρίας)
    if (word.endsWith('α') || word.endsWith('ά')) {
        return word.slice(0, -1) + 'ας';
    }

    // Θηλυκά σε -η (eg: Ελένη → Ελένης)
    if (word.endsWith('η') || word.endsWith('ή')) {
        return word.slice(0, -1) + 'ης';
    }

    // Αρσενικά σε -ος
    if (word.endsWith('ος') || word.endsWith('ός')) {
        // Αρσενικά σε -ιος (Αναστάσιος → Αναστασίου, Γεώργιος → Γεωργίου)
        if (word.endsWith('ιος')) {
            return word.slice(0, -3) + 'ίου';
        }

        // Εξαίρεση αρσενικά σε -ίνος (Κωνσταντίνος → Κωνσταντίνου)
        if (word.endsWith('ίνος')) {
            return word.slice(0, -2) + 'ου';
        }

        const category = accentCategorization(word);

        if (category === 'LIG') {
            // Λήγουσα: Νικολός → Νικολού
            return word.slice(0, -2) + 'ού';
        }
        if (category === 'PAR') {
            // Παραλήγουσα: Χρήστος → Χρήστου  
            return word.slice(0, -2) + 'ου';
        }
        if (category === 'PRO') {
            // Προπαραλήγουσα: Αλέξανδρος → Αλεξάνδρου
            return word.slice(0, -2) + 'ου';
        }

        // Default for -ος without clear accent pattern
        return word.slice(0, -2) + 'ου';
    }

    // Ουδέτερα σε -ο (rare for names, but just in case)
    if (word.endsWith('ο') || word.endsWith('ό')) {
        return word.slice(0, -1) + 'ου';
    }

    // If no pattern matches, return original word
    return word;
} 