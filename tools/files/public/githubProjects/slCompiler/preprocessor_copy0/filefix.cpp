#include <iostream>
#include <stdio.h> // As requested, though <cstdio> is the modern C++ equivalent

int main() {
    // 1. Open the file in read mode ("r")
    FILE* filePointer = fopen("try1.txt", "r");

    // 2. Check if the file was successfully opened
    if (filePointer == nullptr) {
        std::cerr << "Error: Could not open file 'try1.txt'. Make sure it exists in the current directory." << std::endl;
        return 1; // Return with an error code
    }

    // 3. Read the file and output it using cout
    char buffer[1024]; // Buffer to hold chunks of text (reads line by line)
    
    // fgets reads up to 1023 characters or until a newline/EOF is reached
    while (fgets(buffer, sizeof(buffer), filePointer) != nullptr) {
        std::cout << buffer;
    }

    // 4. Close the file to free up system resources
    fclose(filePointer);

    return 0;
}