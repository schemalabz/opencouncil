# This script scans specified directories for source code files, extracts their content, and generates a Markdown file with the context of the project.
# The generated file can be used to provide context for AI models like Gemini 2.5 Pro (1 mill context) or documentation purposes.

import os
import fnmatch

# --- Configuration ---

# 1. Directories to scan
# Add the root directories you want to scan here.
TARGET_DIRS = ['src']

# 2. File extensions to include
# The script will only include files with these extensions.
TARGET_EXTENSIONS = ('.ts', '.tsx', '.jsx', '.js')

# 3. Directories and files to ignore
# Add any directory or file names you want to exclude from the scan.
# Common examples like 'node_modules' and '__pycache__' are included.
IGNORE_LIST = [
    'node_modules',
    'dist',
    'build',
    '.venv',
    '__pycache__',
    'package*',   
    'env',
    'ui',
    '.git*',
    '*.db',
    '*.txt',
    'messages.json'
    'assets',
    '*.css',
    '.prettier*',
    '.eslint*',
    'tailwind.config.js',
    'tsconfig.*',
    'components.json',
    # Add any other files or directories to ignore here
    # e.g., 'my_secret_file.js'
]

# 4. Output file name
OUTPUT_FILE = 'output.md'

# --- Script ---

def get_language_from_extension(file_path):
    """Maps a file extension to a Markdown language identifier."""
    ext = os.path.splitext(file_path)[1]
    mapping = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
    }
    return mapping.get(ext, '')

def should_ignore(path):
    """Determines if a file/directory should be ignored based on IGNORE_LIST patterns."""
    path_parts = path.split(os.sep)
    # print(f"Checking if '{path}' should be ignored. Path parts: {path_parts}")
    
    for pattern in IGNORE_LIST:
        for part in path_parts:
            if fnmatch.fnmatch(part, pattern):
                # print(f"Ignoring: '{part}' matches pattern '{pattern}'")
                return True
    return False

def create_context_file():
    """Scans directories and creates the context file."""
    if not any(os.path.exists(d) for d in TARGET_DIRS):
        print("Error: None of the target directories exist. Please check the TARGET_DIRS list.")
        print(f"Looked for: {', '.join(TARGET_DIRS)}")
        return

    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
            for directory in TARGET_DIRS:
                if not os.path.exists(directory):
                    continue
                for root, dirs, files in os.walk(directory, topdown=True):
                    # Prune ignored directories from traversal
                    dirs[:] = [d for d in dirs if not should_ignore(os.path.join(root, d))]
                    
                    for file in files:
                        file_path = os.path.join(root, file)
                        
                        if file.endswith(TARGET_EXTENSIONS) and not should_ignore(file_path):
                            try:
                                with open(file_path, 'r', encoding='utf-8', errors='ignore') as infile:
                                    content = infile.read()
                                
                                language = get_language_from_extension(file)
                                normalized_path = os.path.normpath(file_path)

                                outfile.write(f"{normalized_path}:\n")
                                outfile.write(f"```{language}\n")
                                outfile.write(content)
                                outfile.write("\n```\n\n")
                            except Exception as e:
                                print(f"Error reading file {file_path}: {e}")
        
        print(f"Successfully created '{OUTPUT_FILE}' with the project context.")

    except IOError as e:
        print(f"Error writing to output file {OUTPUT_FILE}: {e}")

if __name__ == '__main__':
    create_context_file()