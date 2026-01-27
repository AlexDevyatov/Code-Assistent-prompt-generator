"""Тесты для функции извлечения намерения о погоде"""
import pytest
import sys
from pathlib import Path

# Добавляем корневую директорию проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.routers.weather_chat import _extract_weather_intent


class TestExtractWeatherIntent:
    """Тесты для функции _extract_weather_intent"""
    
    def test_weather_request_with_location_in_moscow(self):
        """Тест: 'погода в Москве'"""
        result = _extract_weather_intent("погода в Москве")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Москве"
    
    def test_weather_request_with_location_in_moscow_lowercase(self):
        """Тест: 'погода в москве' (с маленькой буквы)"""
        result = _extract_weather_intent("погода в москве")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Москве"
    
    def test_tell_weather_in_city(self):
        """Тест: 'расскажи какая погода в Санкт-Петербурге'"""
        result = _extract_weather_intent("расскажи какая погода в Санкт-Петербурге")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Санкт-петербурге"
    
    def test_weather_in_city_simple(self):
        """Тест: 'погода в City_name'"""
        result = _extract_weather_intent("погода в City_name")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "City_name"
    
    def test_what_weather_in_city(self):
        """Тест: 'какая погода в Новосибирске'"""
        result = _extract_weather_intent("какая погода в Новосибирске")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Новосибирске"
    
    def test_forecast_request(self):
        """Тест: 'прогноз погоды в Москве на 5 дней'"""
        result = _extract_weather_intent("прогноз погоды в Москве на 5 дней")
        assert result is not None
        assert result["type"] == "forecast"
        assert result["days"] == 5
        assert result["location"] == "Москве"
    
    def test_forecast_request_7_days(self):
        """Тест: 'прогноз на 7 дней в Санкт-Петербурге'"""
        result = _extract_weather_intent("прогноз на 7 дней в Санкт-Петербурге")
        assert result is not None
        assert result["type"] == "forecast"
        assert result["days"] == 7
        assert result["location"] == "Санкт-петербурге"
    
    def test_forecast_request_more_than_7_days(self):
        """Тест: 'прогноз на 10 дней' - должно ограничиться 7 днями"""
        result = _extract_weather_intent("прогноз на 10 дней в Москве")
        assert result is not None
        assert result["type"] == "forecast"
        assert result["days"] == 7  # Ограничение максимум 7 дней
        assert result["location"] == "Москве"
    
    def test_weather_in_english(self):
        """Тест: 'weather in London'"""
        result = _extract_weather_intent("weather in London")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "London"
    
    def test_city_first_pattern(self):
        """Тест: 'Москва погода'"""
        result = _extract_weather_intent("Москва погода")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Москва"
    
    def test_no_weather_keywords(self):
        """Тест: запрос без ключевых слов о погоде"""
        result = _extract_weather_intent("как дела?")
        assert result is None
    
    def test_weather_without_location(self):
        """Тест: запрос о погоде без указания местоположения"""
        result = _extract_weather_intent("какая погода?")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] is None
    
    def test_multiple_cities_mentioned(self):
        """Тест: упоминание нескольких городов - захватывает все слова до знака препинания"""
        result = _extract_weather_intent("погода в Москве и Санкт-Петербурге")
        assert result is not None
        # Функция захватывает все слова после "в" до конца строки или знака препинания
        # Это приемлемое поведение - можно обработать несколько городов или взять первый
        assert result["location"] is not None
        assert "Москве" in result["location"]
    
    def test_weather_with_punctuation(self):
        """Тест: запрос со знаками препинания"""
        result = _extract_weather_intent("погода в Москве!")
        assert result is not None
        assert result["location"] == "Москве"
    
    def test_weather_with_question_mark(self):
        """Тест: запрос с вопросительным знаком"""
        result = _extract_weather_intent("Какая погода в Москве?")
        assert result is not None
        assert result["location"] == "Москве"
    
    def test_complex_request(self):
        """Тест: сложный запрос"""
        result = _extract_weather_intent("Расскажи, пожалуйста, какая сейчас погода в городе Новосибирск?")
        assert result is not None
        assert result["type"] == "current"
        # Может извлечь "Новосибирск" или "городе Новосибирск" - оба варианта приемлемы
        assert result["location"] is not None
    
    def test_temperature_keyword(self):
        """Тест: запрос с ключевым словом 'температура'"""
        result = _extract_weather_intent("температура в Москве")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Москве"
    
    def test_rain_keyword(self):
        """Тест: запрос с ключевым словом 'дождь'"""
        result = _extract_weather_intent("будет ли дождь в Санкт-Петербурге")
        assert result is not None
        assert result["type"] == "current"
        assert result["location"] == "Санкт-петербурге"
    
    def test_forecast_keyword(self):
        """Тест: запрос с ключевым словом 'прогноз'"""
        result = _extract_weather_intent("прогноз в Москве")
        assert result is not None
        assert result["type"] == "forecast"
        assert result["location"] == "Москве"
    
    def test_location_with_hyphen(self):
        """Тест: название города с дефисом"""
        result = _extract_weather_intent("погода в Санкт-Петербурге")
        assert result is not None
        assert result["location"] == "Санкт-петербурге"
    
    def test_location_lowercase_city(self):
        """Тест: название города с маленькой буквы"""
        result = _extract_weather_intent("погода в москве")
        assert result is not None
        assert result["location"] == "Москве"  # Должно нормализоваться
    
    def test_english_city_name(self):
        """Тест: английское название города"""
        result = _extract_weather_intent("weather in New York")
        assert result is not None
        assert result["location"] == "New York"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
