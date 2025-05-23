// search.js

// Trie data structure for efficient search
class TrieNode {
    constructor() {
      this.children = {};
      this.isEndOfWord = false;
      this.users = []; // Store users for each prefix
    }
  }
  
  class Trie {
    constructor() {
      this.root = new TrieNode();
    }
  
    // Insert a user into the Trie
    insert(user) {
        if (!user || typeof user.name !== 'string') return; // Skip if user name is invalid

        let node = this.root;
        const name = user.name.toLowerCase();

        for (const char of name) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }

            node = node.children[char];
            node.users.push(user); // Add user to the node's list of users
        }

        node.isEndOfWord = true;
    }
  
    // Search users by prefix
    search(prefix) {
        let node = this.root;
        prefix = prefix.toLowerCase();

        for (const char of prefix) {
            if (!node.children[char]) {
                return []; // No users found with this prefix
            }
            node = node.children[char];
        }

        // Return the users matching the prefix
        return node.users;
    }
  }
  
  // Export the Trie class
  export { Trie };
  