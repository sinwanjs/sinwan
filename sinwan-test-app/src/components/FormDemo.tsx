/**
 * FormDemo Component
 *
 * A form example using Sinwan's React-compatible Form, Input, Button components
 * with action function that logs to console
 */

import { cc } from "sinwan/component";
import {
  Form,
  Input,
  Button,
  Select,
  Option,
  Textarea,
} from "sinwan/react-client";

export const FormDemo = cc(() => {
  const handleSubmit = (formData: FormData) => {
    // Log all form data to console
    console.log("Form submitted with data:");
    for (const [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    }

    // Also log as object for easier reading
    const data: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value as string;
    }
    console.log("Form data as object:", data);
  };

  return (
    <div class="p-8 bg-[#0b1020] text-white min-h-screen">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-6">Formulaire d'inscription</h1>
        <p class="mb-6 text-gray-300">
          Remplissez le formulaire ci-dessous pour vous inscrire.
        </p>

        <Form action={handleSubmit} class="space-y-6">
          {/* Name Field */}
          <div>
            <label for="name" class="block text-sm font-medium mb-2">
              Nom complet *
            </label>
            <Input
              type="text"
              id="name"
              name="name"
              class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
              required
            />
          </div>

          {/* Email Field */}
          <div>
            <label for="email" class="block text-sm font-medium mb-2">
              Email *
            </label>
            <Input
              type="email"
              id="email"
              name="email"
              class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="john@example.com"
              required
            />
          </div>

          {/* Password Fields */}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="password" class="block text-sm font-medium mb-2">
                Mot de passe *
              </label>
              <Input
                type="password"
                id="password"
                name="password"
                class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label
                for="confirmPassword"
                class="block text-sm font-medium mb-2"
              >
                Confirmer *
              </label>
              <Input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Age Field */}
          <div>
            <label for="age" class="block text-sm font-medium mb-2">
              Âge
            </label>
            <Input
              type="number"
              id="age"
              name="age"
              min="18"
              max="120"
              class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="25"
            />
          </div>

          {/* Gender Selection */}
          <div>
            <label class="block text-sm font-medium mb-2">Genre</label>
            <div class="flex gap-4">
              <label class="flex items-center">
                <Input type="radio" name="gender" value="male" class="mr-2" />
                <span>Homme</span>
              </label>
              <label class="flex items-center">
                <Input type="radio" name="gender" value="female" class="mr-2" />
                <span>Femme</span>
              </label>
              <label class="flex items-center">
                <Input type="radio" name="gender" value="other" class="mr-2" />
                <span>Autre</span>
              </label>
            </div>
          </div>

          {/* Country Select */}
          <div>
            <label for="country" class="block text-sm font-medium mb-2">
              Pays
            </label>
            <Select
              id="country"
              name="country"
              defaultValue=""
              class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <Option value="">Sélectionner un pays</Option>
              <Option value="fr">France</Option>
              <Option value="be">Belgique</Option>
              <Option value="ch">Suisse</Option>
              <Option value="ca">Canada</Option>
              <Option value="us">États-Unis</Option>
              <Option value="other">Autre</Option>
            </Select>
          </div>

          {/* Message Textarea */}
          <div>
            <label for="message" class="block text-sm font-medium mb-2">
              Message
            </label>
            <Textarea
              id="message"
              name="message"
              rows="4"
              class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Écrivez votre message ici..."
            />
          </div>

          {/* Checkboxes */}
          <div class="space-y-3">
            <label class="flex items-start">
              <Input type="checkbox" name="newsletter" class="mt-1 mr-3" />
              <span class="text-sm text-gray-300">
                Je souhaite recevoir la newsletter et les promotions par email
              </span>
            </label>

            <label class="flex items-start">
              <Input type="checkbox" name="terms" class="mt-1 mr-3" required />
              <span class="text-sm text-gray-300">
                J'accepte les conditions d'utilisation et la politique de
                confidentialité *
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            class="w-full py-3 px-6 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            S'inscrire
          </Button>
        </Form>

        <div class="mt-8 p-4 bg-gray-800 rounded-lg">
          <h3 class="text-lg font-bold mb-2">Instructions</h3>
          <p class="text-sm text-gray-300">
            Remplissez le formulaire et cliquez sur "S'inscrire". Les données du
            formulaire seront affichées dans la console du navigateur.
          </p>
        </div>
      </div>
    </div>
  );
});
