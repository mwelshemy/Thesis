using System;

namespace DemoApp {
    class UserController {
        private string username;

        public UserController(string name) {
            username = name;
        }

        public void PrintUser() {
            Console.WriteLine($"User: {username}");
        }
    }
}